import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import type {
  CreateBusinessDto,
  CreateOrderDto,
  CreateProductDto,
  MarketplaceQueryDto,
  UpdateBusinessDto,
  UpdateOrderStatusDto,
  UpdateProductDto,
} from './marketplace.dto';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  businesses(query: MarketplaceQueryDto) {
    return this.prisma.businessProfile.findMany({
      where: {
        status: { in: ['VERIFIED', 'PENDING'] },
        ...(query.category ? { category: query.category } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { description: { contains: query.search, mode: 'insensitive' as const } },
                { category: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        owner: { select: { profile: { select: { displayName: true, avatarUrl: true } } } },
        _count: { select: { products: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ status: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }],
      take: 60,
    });
  }

  async myBusiness(userId: string) {
    const business = await this.prisma.businessProfile.findUnique({
      where: { ownerId: userId },
      include: {
        owner: {
          select: { profile: { select: { displayName: true, avatarUrl: true } } },
        },
        products: { orderBy: { createdAt: 'desc' } },
        _count: { select: { products: true, orders: true } },
      },
    });
    return { business };
  }

  async business(userId: string, businessId: string) {
    const business = await this.prisma.businessProfile.findFirst({
      where: {
        id: businessId,
        OR: [
          { ownerId: userId },
          { status: { in: ['VERIFIED', 'PENDING'] } },
        ],
      },
      include: {
        owner: {
          select: { profile: { select: { displayName: true, avatarUrl: true } } },
        },
        products: {
          where: { OR: [{ status: 'ACTIVE' }, { business: { ownerId: userId } }] },
          orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        },
        _count: { select: { products: true, orders: true } },
      },
    });
    if (!business) throw new NotFoundException('Boutique introuvable');
    return business;
  }

  products(query: MarketplaceQueryDto) {
    return this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        stock: { gt: 0 },
        ...(query.businessId ? { businessId: query.businessId } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { description: { contains: query.search, mode: 'insensitive' as const } },
                { category: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: { business: { select: { id: true, name: true, slug: true, status: true, city: true } } },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async product(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        status: 'ACTIVE',
        business: { status: { in: ['VERIFIED', 'PENDING'] } },
      },
      include: {
        business: {
          select: { id: true, name: true, slug: true, status: true, city: true },
        },
      },
    });
    if (!product) throw new NotFoundException('Produit introuvable');
    return product;
  }

  async createBusiness(userId: string, dto: CreateBusinessDto) {
    try {
      return await this.prisma.businessProfile.create({
        data: { ownerId: userId, ...dto, status: 'PENDING' },
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('Vous avez déjà une boutique ou ce lien est utilisé');
      }
      throw error;
    }
  }

  async updateBusiness(userId: string, dto: UpdateBusinessDto) {
    const business = await this.prisma.businessProfile.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (!business) throw new NotFoundException('Boutique introuvable');
    const { logoUploadId, coverUploadId, ...rest } = dto;
    const [logoUrl, coverUrl] = await Promise.all([
      this.uploads.resolveOwnedUploadKey(userId, logoUploadId),
      this.uploads.resolveOwnedUploadKey(userId, coverUploadId),
    ]);
    return this.prisma.businessProfile.update({
      where: { id: business.id },
      data: {
        ...rest,
        ...(logoUploadId !== undefined ? { logoUrl } : {}),
        ...(coverUploadId !== undefined ? { coverUrl } : {}),
      },
    });
  }

  async createProduct(userId: string, dto: CreateProductDto) {
    const business = await this.prisma.businessProfile.findUnique({ where: { ownerId: userId } });
    if (!business || business.status === 'SUSPENDED' || business.status === 'REJECTED') {
      throw new ForbiddenException('Boutique active requise');
    }
    const { imageUploadIds, ...rest } = dto;
    const images = await this.resolveProductImages(userId, imageUploadIds);
    return this.prisma.product.create({
      data: {
        businessId: business.id,
        ...rest,
        ...(images !== undefined ? { images } : {}),
        status: dto.stock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
      },
      include: { business: { select: { id: true, name: true } } },
    });
  }

  async updateProduct(userId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, business: { ownerId: userId } },
      select: { id: true, stock: true, images: true },
    });
    if (!product) throw new NotFoundException('Produit introuvable');
    const finalStock = dto.stock ?? product.stock;
    const { imageUploadIds, ...rest } = dto;
    const newImages = await this.resolveProductImages(userId, imageUploadIds);
    // Une mise à jour ajoute des photos aux existantes plutôt que de les
    // remplacer : le client ne connaît les photos déjà en place que par
    // leur lien signé, pas par un id d'upload qu'il pourrait renvoyer.
    const images =
      newImages === undefined
        ? undefined
        : [...product.images, ...newImages].slice(0, 8);
    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...rest,
        ...(images !== undefined ? { images } : {}),
        status: finalStock > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
      },
      include: { business: { select: { id: true, name: true } } },
    });
  }

  /// Vérifie chaque upload (propriété + statut terminé) avant de les
  /// accepter comme photos du produit. `undefined` si le champ n'a pas été
  /// fourni du tout, pour ne pas écraser les photos existantes lors d'une
  /// mise à jour partielle.
  private async resolveProductImages(
    userId: string,
    imageUploadIds: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (imageUploadIds === undefined) return undefined;
    return Promise.all(
      imageUploadIds.map((id) => this.uploads.resolveOwnedUploadKey(userId, id)),
    ) as Promise<string[]>;
  }

  orders(userId: string) {
    return this.prisma.marketplaceOrder.findMany({
      where: { OR: [{ buyerId: userId }, { business: { ownerId: userId } }] },
      include: {
        business: { select: { id: true, name: true, logoUrl: true, ownerId: true } },
        buyer: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        lines: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const scopedKey = `${userId}:order-create:${dto.idempotencyKey}`;
    const duplicate = await this.prisma.marketplaceOrder.findUnique({
      where: { idempotencyKey: scopedKey },
      include: { business: true, lines: true },
    });
    if (duplicate) return duplicate;
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    const productIds = [...quantities.keys()];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, status: 'ACTIVE' },
      include: { business: { select: { id: true, ownerId: true } } },
    });
    if (products.length !== productIds.length) throw new BadRequestException('Produit indisponible');
    const businessId = products[0].businessId;
    if (products.some((product) => product.businessId !== businessId)) {
      throw new BadRequestException('Une commande doit concerner une seule boutique');
    }
    if (products[0].business.ownerId === userId) {
      throw new BadRequestException('Vous ne pouvez pas acheter dans votre propre boutique');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const transactionDuplicate = await tx.marketplaceOrder.findUnique({
          where: { idempotencyKey: scopedKey },
          include: { business: true, lines: true },
        });
        if (transactionDuplicate) return transactionDuplicate;
        let subtotalXof = 0;
        const lines = [] as Array<{
          productId: string;
          productName: string;
          unitPriceXof: number;
          quantity: number;
          lineTotalXof: number;
        }>;
        for (const product of products) {
          const quantity = quantities.get(product.id)!;
          const reserved = await tx.product.updateMany({
            where: { id: product.id, status: 'ACTIVE', stock: { gte: quantity } },
            data: { stock: { decrement: quantity } },
          });
          if (reserved.count !== 1) throw new ConflictException(`${product.name} n'est plus disponible`);
          const lineTotalXof = product.priceXof * quantity;
          subtotalXof += lineTotalXof;
          lines.push({
            productId: product.id,
            productName: product.name,
            unitPriceXof: product.priceXof,
            quantity,
            lineTotalXof,
          });
        }
        const deliveryFeeXof = subtotalXof >= 25_000 ? 0 : 1_000;
        return tx.marketplaceOrder.create({
          data: {
            reference: `ZAM-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 5).toUpperCase()}`,
            idempotencyKey: scopedKey,
            buyerId: userId,
            businessId,
            subtotalXof,
            deliveryFeeXof,
            totalXof: subtotalXof + deliveryFeeXof,
            deliveryAddress: dto.deliveryAddress,
            customerNote: dto.customerNote ?? '',
            lines: { create: lines },
          },
          include: { business: true, lines: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateOrderStatus(userId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { business: { select: { ownerId: true } } },
    });
    if (!order || order.business.ownerId !== userId) throw new NotFoundException('Commande introuvable');
    const transitions: Record<string, string[]> = {
      PENDING_PAYMENT: ['CANCELLED'],
      PAID: ['ACCEPTED'],
      ACCEPTED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY'],
      READY: ['SHIPPED', 'DELIVERED'],
      SHIPPED: ['DELIVERED'],
    };
    if (!transitions[order.status]?.includes(dto.status)) {
      throw new ConflictException(`Transition ${order.status} → ${dto.status} interdite`);
    }
    if (dto.status === 'CANCELLED' && order.status === 'PENDING_PAYMENT') {
      return this.prisma.$transaction(async (tx) => {
        const lines = await tx.marketplaceOrderLine.findMany({ where: { orderId } });
        for (const line of lines) {
          await tx.product.update({
            where: { id: line.productId },
            data: { stock: { increment: line.quantity } },
          });
        }
        return tx.marketplaceOrder.update({
          where: { id: orderId },
          data: { status: 'CANCELLED' },
        });
      });
    }
    return this.prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: dto.status },
    });
  }

  private isUniqueConstraint(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
