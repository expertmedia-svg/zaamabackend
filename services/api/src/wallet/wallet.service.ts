import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Prisma, type LedgerAccount } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { TopUpWalletDto, TransferWalletDto } from './wallet.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async overview(userId: string) {
    const account = await this.ensureUserAccount(userId);
    const [balanceXof, operations] = await Promise.all([
      this.balance(account.id),
      this.prisma.walletOperation.findMany({
        where: { OR: [{ debitAccountId: account.id }, { creditAccountId: account.id }] },
        include: {
          debitAccount: { select: { ownerId: true, code: true } },
          creditAccount: { select: { ownerId: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ]);
    return { currency: 'XOF', balanceXof, accountStatus: account.active ? 'ACTIVE' : 'FROZEN', operations };
  }

  async topUp(userId: string, dto: TopUpWalletDto) {
    if (dto.provider !== 'SANDBOX') {
      throw new ServiceUnavailableException(
        'Connecteur en attente du contrat marchand et des identifiants opérateur',
      );
    }
    if (
      this.config.get<string>('NODE_ENV') === 'production' ||
      !['dev', 'development', 'test'].includes(
        this.config.get<string>('APP_ENV') ?? '',
      )
    ) {
      throw new ServiceUnavailableException(
        'Le connecteur sandbox est strictement réservé au développement local',
      );
    }
    const scopedKey = `${userId}:topup:${dto.idempotencyKey}`;
    const existing = await this.prisma.walletOperation.findUnique({
      where: { idempotencyKey: scopedKey },
    });
    if (existing) return existing;

    const [wallet, clearing] = await Promise.all([
      this.ensureUserAccount(userId),
      this.ensureSystemAccount('SYSTEM:SANDBOX:XOF', 'PROVIDER_CLEARING'),
    ]);
    return this.prisma.$transaction(
      async (tx) => {
        const duplicate = await tx.walletOperation.findUnique({
          where: { idempotencyKey: scopedKey },
        });
        if (duplicate) return duplicate;
        return tx.walletOperation.create({
          data: {
            reference: this.reference('RCH'),
            idempotencyKey: scopedKey,
            initiatedById: userId,
            debitAccountId: clearing.id,
            creditAccountId: wallet.id,
            type: 'TOP_UP',
            status: 'SUCCEEDED',
            provider: 'SANDBOX',
            providerReference: this.reference('SBX'),
            amountXof: dto.amountXof,
            label: `Recharge test ${dto.phone}`,
            completedAt: new Date(),
            entries: {
              create: [
                { accountId: clearing.id, direction: 'DEBIT', amountXof: dto.amountXof },
                { accountId: wallet.id, direction: 'CREDIT', amountXof: dto.amountXof },
              ],
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async transfer(userId: string, dto: TransferWalletDto) {
    if (dto.recipientUserId === userId) {
      throw new BadRequestException('Le destinataire doit être différent');
    }
    const recipient = await this.prisma.user.findFirst({
      where: { id: dto.recipientUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('Destinataire introuvable');
    const [senderAccount, recipientAccount] = await Promise.all([
      this.ensureUserAccount(userId),
      this.ensureUserAccount(dto.recipientUserId),
    ]);
    return this.postTransfer({
      userId,
      debit: senderAccount,
      credit: recipientAccount,
      amountXof: dto.amountXof,
      label: dto.label,
      idempotencyKey: `${userId}:transfer:${dto.idempotencyKey}`,
      type: 'TRANSFER',
    });
  }

  async payMarketplaceOrder(userId: string, orderId: string, idempotencyKey: string) {
    const scopedKey = `${userId}:order:${orderId}:${idempotencyKey}`;
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { business: { select: { ownerId: true, name: true } } },
    });
    if (!order || order.buyerId !== userId) throw new NotFoundException('Commande introuvable');
    if (order.status !== 'PENDING_PAYMENT') {
      if (order.paymentOperationId) {
        return this.prisma.walletOperation.findUnique({ where: { id: order.paymentOperationId } });
      }
      throw new ConflictException('Cette commande ne peut plus être payée');
    }
    const [buyerAccount, merchantAccount] = await Promise.all([
      this.ensureUserAccount(userId),
      this.ensureUserAccount(order.business.ownerId),
    ]);
    return this.prisma.$transaction(
      async (tx) => {
        const duplicate = await tx.walletOperation.findUnique({ where: { idempotencyKey: scopedKey } });
        if (duplicate) return duplicate;
        const freshOrder = await tx.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId } });
        if (freshOrder.status !== 'PENDING_PAYMENT') {
          throw new ConflictException('Commande déjà traitée');
        }
        const currentBalance = await this.balanceInTransaction(tx, buyerAccount.id);
        if (currentBalance < freshOrder.totalXof) {
          throw new BadRequestException('Solde ZAAMA insuffisant');
        }
        const operation = await tx.walletOperation.create({
          data: {
            reference: this.reference('PAY'),
            idempotencyKey: scopedKey,
            initiatedById: userId,
            debitAccountId: buyerAccount.id,
            creditAccountId: merchantAccount.id,
            type: 'MARKETPLACE_PAYMENT',
            status: 'SUCCEEDED',
            amountXof: freshOrder.totalXof,
            label: `Paiement ${order.reference} · ${order.business.name}`,
            completedAt: new Date(),
            entries: {
              create: [
                { accountId: buyerAccount.id, direction: 'DEBIT', amountXof: freshOrder.totalXof },
                { accountId: merchantAccount.id, direction: 'CREDIT', amountXof: freshOrder.totalXof },
              ],
            },
          },
        });
        await tx.marketplaceOrder.update({
          where: { id: orderId },
          data: { status: 'PAID', paymentOperationId: operation.id },
        });
        return operation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async postTransfer(input: {
    userId: string;
    debit: LedgerAccount;
    credit: LedgerAccount;
    amountXof: number;
    label: string;
    idempotencyKey: string;
    type: 'TRANSFER';
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const duplicate = await tx.walletOperation.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (duplicate) return duplicate;
        const currentBalance = await this.balanceInTransaction(tx, input.debit.id);
        if (currentBalance < input.amountXof) throw new BadRequestException('Solde ZAAMA insuffisant');
        return tx.walletOperation.create({
          data: {
            reference: this.reference('TRF'),
            idempotencyKey: input.idempotencyKey,
            initiatedById: input.userId,
            debitAccountId: input.debit.id,
            creditAccountId: input.credit.id,
            type: input.type,
            status: 'SUCCEEDED',
            amountXof: input.amountXof,
            label: input.label,
            completedAt: new Date(),
            entries: {
              create: [
                { accountId: input.debit.id, direction: 'DEBIT', amountXof: input.amountXof },
                { accountId: input.credit.id, direction: 'CREDIT', amountXof: input.amountXof },
              ],
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private ensureUserAccount(userId: string) {
    return this.prisma.ledgerAccount.upsert({
      where: { ownerId: userId },
      update: {},
      create: { code: `WALLET:${userId}`, ownerId: userId, type: 'USER_WALLET' },
    });
  }

  private ensureSystemAccount(code: string, type: 'PROVIDER_CLEARING') {
    return this.prisma.ledgerAccount.upsert({
      where: { code },
      update: {},
      create: { code, type },
    });
  }

  private async balance(accountId: string) {
    return this.balanceInTransaction(this.prisma, accountId);
  }

  private async balanceInTransaction(tx: Prisma.TransactionClient | PrismaService, accountId: string) {
    const [credits, debits] = await Promise.all([
      tx.ledgerEntry.aggregate({ where: { accountId, direction: 'CREDIT' }, _sum: { amountXof: true } }),
      tx.ledgerEntry.aggregate({ where: { accountId, direction: 'DEBIT' }, _sum: { amountXof: true } }),
    ]);
    return (credits._sum.amountXof ?? 0) - (debits._sum.amountXof ?? 0);
  }

  private reference(prefix: string) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }
}
