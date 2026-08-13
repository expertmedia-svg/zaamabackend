import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHmac } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../services/api/src/generated/prisma/client';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Development seed is disabled in production');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const secret = process.env.CONTACT_HASH_SECRET ?? process.env.JWT_SECRET ?? 'dev-secret';
const phoneHash = (phone: string) =>
  createHmac('sha256', secret).update(phone).digest('hex');

const ids = {
  awa: '00000000-0000-4000-8000-000000000001',
  moussa: '00000000-0000-4000-8000-000000000002',
  direct: '10000000-0000-4000-8000-000000000001',
  groupConversation: '10000000-0000-4000-8000-000000000002',
  group: '20000000-0000-4000-8000-000000000001',
  ownerRole: '30000000-0000-4000-8000-000000000001',
  adminRole: '30000000-0000-4000-8000-000000000002',
  memberRole: '30000000-0000-4000-8000-000000000003',
  story: '40000000-0000-4000-8000-000000000001',
  storyItem: '50000000-0000-4000-8000-000000000001',
  contact: '60000000-0000-4000-8000-000000000001',
  contactMatch: '60000000-0000-4000-8000-000000000002',
  reverseContact: '60000000-0000-4000-8000-000000000003',
  reverseContactMatch: '60000000-0000-4000-8000-000000000004',
  directMessageA: '70000000-0000-4000-8000-000000000001',
  directMessageB: '70000000-0000-4000-8000-000000000002',
  groupMessage: '70000000-0000-4000-8000-000000000003',
  directClientA: '71000000-0000-4000-8000-000000000001',
  directClientB: '71000000-0000-4000-8000-000000000002',
  groupClient: '71000000-0000-4000-8000-000000000003',
  call: '80000000-0000-4000-8000-000000000001',
  topicGeneral: '81000000-0000-4000-8000-000000000001',
  topicProjet: '81000000-0000-4000-8000-000000000002',
  business: '82000000-0000-4000-8000-000000000001',
  productFasoDanFani: '83000000-0000-4000-8000-000000000001',
  productShea: '83000000-0000-4000-8000-000000000002',
  productBasket: '83000000-0000-4000-8000-000000000003',
  productCoffee: '83000000-0000-4000-8000-000000000004',
  awaAccount: '84000000-0000-4000-8000-000000000001',
  moussaAccount: '84000000-0000-4000-8000-000000000002',
  clearingAccount: '84000000-0000-4000-8000-000000000003',
  initialTopUp: '85000000-0000-4000-8000-000000000001',
  initialTopUpDebit: '86000000-0000-4000-8000-000000000001',
  initialTopUpCredit: '86000000-0000-4000-8000-000000000002',
};

async function main(): Promise<void> {
  const [awa, moussa] = await Promise.all([
    prisma.user.upsert({
      where: { phone: '+22670000001' },
      update: {
        profile: {
          upsert: {
            create: {
              username: 'awa',
              displayName: 'Awa Ouédraogo',
              avatarUrl: 'asset://zaama/awa',
              bio: 'Disponible · Notre lien, notre force.',
            },
            update: {
              displayName: 'Awa Ouédraogo',
              avatarUrl: 'asset://zaama/awa',
              bio: 'Disponible · Notre lien, notre force.',
            },
          },
        },
      },
      create: {
        id: ids.awa,
        phone: '+22670000001',
        phoneHash: phoneHash('+22670000001'),
        profile: {
          create: {
            username: 'awa',
            displayName: 'Awa Ouédraogo',
            avatarUrl: 'asset://zaama/awa',
            bio: 'Disponible · Notre lien, notre force.',
          },
        },
      },
    }),
    prisma.user.upsert({
      where: { phone: '+22670000002' },
      update: {
        profile: {
          upsert: {
            create: {
              username: 'moussa',
              displayName: 'Moussa Traoré',
              avatarUrl: 'asset://zaama/moussa',
              bio: 'En ligne sur ZAAMA',
            },
            update: {
              displayName: 'Moussa Traoré',
              avatarUrl: 'asset://zaama/moussa',
              bio: 'En ligne sur ZAAMA',
            },
          },
        },
      },
      create: {
        id: ids.moussa,
        phone: '+22670000002',
        phoneHash: phoneHash('+22670000002'),
        profile: {
          create: {
            username: 'moussa',
            displayName: 'Moussa Traoré',
            avatarUrl: 'asset://zaama/moussa',
            bio: 'En ligne sur ZAAMA',
          },
        },
      },
    }),
  ]);

  const directKey = [awa.id, moussa.id].sort().join(':');
  await prisma.conversation.upsert({
    where: { directKey },
    update: {},
    create: {
      id: ids.direct,
      directKey,
      type: 'DIRECT',
      members: { create: [{ userId: awa.id }, { userId: moussa.id }] },
    },
  });

  await prisma.conversation.upsert({
    where: { id: ids.groupConversation },
    update: {},
    create: {
      id: ids.groupConversation,
      type: 'GROUP',
      members: { create: [{ userId: awa.id }, { userId: moussa.id }] },
    },
  });
  await prisma.group.upsert({
    where: { id: ids.group },
    update: { name: 'Équipe Projet Zaama', avatarUrl: 'asset://zaama/group' },
    create: {
      id: ids.group,
      conversationId: ids.groupConversation,
      ownerId: awa.id,
      name: 'Équipe Projet Zaama',
      description: 'Coordination de la plateforme souveraine',
      avatarUrl: 'asset://zaama/group',
      inviteCode: 'saaga-demo',
    },
  });
  const permissions = {
    OWNER: { manageGroup: true, manageMembers: true, sendMessages: true },
    ADMIN: { manageGroup: true, manageMembers: true, sendMessages: true },
    MEMBER: { manageGroup: false, manageMembers: false, sendMessages: true },
  } as const;
  await Promise.all([
    prisma.groupRole.upsert({
      where: { groupId_name: { groupId: ids.group, name: 'OWNER' } },
      update: { permissions: permissions.OWNER },
      create: {
        id: ids.ownerRole,
        groupId: ids.group,
        name: 'OWNER',
        permissions: permissions.OWNER,
      },
    }),
    prisma.groupRole.upsert({
      where: { groupId_name: { groupId: ids.group, name: 'ADMIN' } },
      update: { permissions: permissions.ADMIN },
      create: {
        id: ids.adminRole,
        groupId: ids.group,
        name: 'ADMIN',
        permissions: permissions.ADMIN,
      },
    }),
    prisma.groupRole.upsert({
      where: { groupId_name: { groupId: ids.group, name: 'MEMBER' } },
      update: { permissions: permissions.MEMBER },
      create: {
        id: ids.memberRole,
        groupId: ids.group,
        name: 'MEMBER',
        permissions: permissions.MEMBER,
      },
    }),
  ]);

  await Promise.all([
    prisma.groupTopic.upsert({
      where: { groupId_name: { groupId: ids.group, name: 'Général' } },
      update: {},
      create: {
        id: ids.topicGeneral,
        groupId: ids.group,
        name: 'Général',
        description: 'Annonces et échanges de toute l’équipe',
        icon: '📣',
      },
    }),
    prisma.groupTopic.upsert({
      where: { groupId_name: { groupId: ids.group, name: 'Projet pilote' } },
      update: {},
      create: {
        id: ids.topicProjet,
        groupId: ids.group,
        name: 'Projet pilote',
        description: 'Suivi opérationnel et documents',
        icon: '🚀',
      },
    }),
  ]);
  await Promise.all([
    prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: ids.group, userId: awa.id } },
      update: { roleId: ids.ownerRole },
      create: { groupId: ids.group, userId: awa.id, roleId: ids.ownerRole },
    }),
    prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: ids.group, userId: moussa.id } },
      update: { roleId: ids.memberRole },
      create: { groupId: ids.group, userId: moussa.id, roleId: ids.memberRole },
    }),
  ]);

  const contact = await prisma.contact.upsert({
    where: { id: ids.contact },
    update: { ownerId: awa.id, phoneHash: phoneHash(moussa.phone) },
    create: {
      id: ids.contact,
      ownerId: awa.id,
      phoneHash: phoneHash(moussa.phone),
    },
  });
  await prisma.contactMatch.upsert({
    where: { contactId: contact.id },
    update: { matchedUserId: moussa.id },
    create: {
      id: ids.contactMatch,
      contactId: contact.id,
      matchedUserId: moussa.id,
    },
  });
  const reverseContact = await prisma.contact.upsert({
    where: { id: ids.reverseContact },
    update: { ownerId: moussa.id, phoneHash: phoneHash(awa.phone) },
    create: {
      id: ids.reverseContact,
      ownerId: moussa.id,
      phoneHash: phoneHash(awa.phone),
    },
  });
  await prisma.contactMatch.upsert({
    where: { contactId: reverseContact.id },
    update: { matchedUserId: awa.id },
    create: {
      id: ids.reverseContactMatch,
      contactId: reverseContact.id,
      matchedUserId: awa.id,
    },
  });

  const now = Date.now();
  await Promise.all([
    prisma.message.upsert({
      where: {
        senderId_clientMessageId: {
          senderId: moussa.id,
          clientMessageId: ids.directClientA,
        },
      },
      update: { encryptedPayload: 'DEV_PLAINTEXT:Ça va et toi ?' },
      create: {
        id: ids.directMessageA,
        conversationId: ids.direct,
        senderId: moussa.id,
        clientMessageId: ids.directClientA,
        encryptedPayload: 'DEV_PLAINTEXT:Ça va et toi ?',
        createdAt: new Date(now - 8 * 60 * 1000),
        receipts: { create: { userId: awa.id, state: 'READ' } },
      },
    }),
    prisma.message.upsert({
      where: {
        senderId_clientMessageId: {
          senderId: awa.id,
          clientMessageId: ids.directClientB,
        },
      },
      update: { encryptedPayload: 'DEV_PLAINTEXT:Bien ! Regarde ces photos du marché de Bobo 👇' },
      create: {
        id: ids.directMessageB,
        conversationId: ids.direct,
        senderId: awa.id,
        clientMessageId: ids.directClientB,
        encryptedPayload: 'DEV_PLAINTEXT:Bien ! Regarde ces photos du marché de Bobo 👇',
        createdAt: new Date(now - 7 * 60 * 1000),
        receipts: { create: { userId: moussa.id, state: 'DELIVERED' } },
      },
    }),
    prisma.message.upsert({
      where: {
        senderId_clientMessageId: {
          senderId: moussa.id,
          clientMessageId: ids.groupClient,
        },
      },
      update: { encryptedPayload: 'DEV_PLAINTEXT:N’oubliez pas la réunion cet après-midi à 15h.' },
      create: {
        id: ids.groupMessage,
        conversationId: ids.groupConversation,
        senderId: moussa.id,
        clientMessageId: ids.groupClient,
        encryptedPayload: 'DEV_PLAINTEXT:N’oubliez pas la réunion cet après-midi à 15h.',
        createdAt: new Date(now - 35 * 60 * 1000),
        receipts: { create: { userId: awa.id, state: 'DELIVERED' } },
      },
    }),
  ]);
  await Promise.all([
    prisma.conversation.update({
      where: { id: ids.direct },
      data: { lastMessageAt: new Date(now - 7 * 60 * 1000) },
    }),
    prisma.conversation.update({
      where: { id: ids.groupConversation },
      data: { lastMessageAt: new Date(now - 35 * 60 * 1000) },
    }),
  ]);

  await prisma.story.upsert({
    where: { id: ids.story },
    update: {
      userId: moussa.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      deletedAt: null,
    },
    create: {
      id: ids.story,
      userId: moussa.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      items: {
        create: {
          id: ids.storyItem,
          type: 'IMAGE',
          encryptedPayload: 'ASSET:zaama_story',
        },
      },
    },
  });
  await prisma.storyItem.update({
    where: { id: ids.storyItem },
    data: { type: 'IMAGE', encryptedPayload: 'ASSET:zaama_story' },
  });

  await prisma.call.upsert({
    where: { id: ids.call },
    update: { status: 'ENDED', endedAt: new Date(now - 2 * 60 * 60 * 1000) },
    create: {
      id: ids.call,
      conversationId: ids.direct,
      startedById: moussa.id,
      type: 'AUDIO',
      status: 'ENDED',
      startedAt: new Date(now - 2 * 60 * 60 * 1000 - 75_000),
      connectedAt: new Date(now - 2 * 60 * 60 * 1000 - 70_000),
      endedAt: new Date(now - 2 * 60 * 60 * 1000),
      participants: {
        create: [
          { userId: awa.id, joinedAt: new Date(now - 2 * 60 * 60 * 1000 - 65_000) },
          { userId: moussa.id, joinedAt: new Date(now - 2 * 60 * 60 * 1000 - 70_000) },
        ],
      },
    },
  });

  const business = await prisma.businessProfile.upsert({
    where: { ownerId: moussa.id },
    update: {
      name: 'Wend Panga Créations',
      status: 'VERIFIED',
      rating: 48,
      reviewCount: 127,
    },
    create: {
      id: ids.business,
      ownerId: moussa.id,
      slug: 'wend-panga-creations',
      name: 'Wend Panga Créations',
      description: 'Mode, beauté et artisanat fabriqués avec fierté au Burkina Faso.',
      category: 'Artisanat',
      city: 'Ouagadougou',
      logoUrl: 'asset://zaama/moussa',
      coverUrl: 'asset://zaama/market',
      status: 'VERIFIED',
      rating: 48,
      reviewCount: 127,
    },
  });
  const products = [
    {
      id: ids.productFasoDanFani,
      name: 'Chemise Faso Dan Fani',
      description: 'Tissée localement, coupe moderne et finitions premium.',
      category: 'Mode',
      priceXof: 18500,
      stock: 16,
      imageUrl: 'asset://zaama/product/faso-dan-fani',
      featured: true,
    },
    {
      id: ids.productShea,
      name: 'Coffret karité pur',
      description: 'Beurre de karité naturel et savon artisanal de Bobo.',
      category: 'Beauté',
      priceXof: 7500,
      stock: 34,
      imageUrl: 'asset://zaama/product/karite',
      featured: true,
    },
    {
      id: ids.productBasket,
      name: 'Panier tressé Bolga',
      description: 'Panier robuste, coloré et entièrement fait main.',
      category: 'Maison',
      priceXof: 12000,
      stock: 9,
      imageUrl: 'asset://zaama/product/panier',
      featured: false,
    },
    {
      id: ids.productCoffee,
      name: 'Café Touba du Faso',
      description: 'Mélange aromatique torréfié à Ouagadougou, 500 g.',
      category: 'Alimentation',
      priceXof: 4500,
      stock: 40,
      imageUrl: 'asset://zaama/product/cafe',
      featured: false,
    },
  ] as const;
  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: { ...product, businessId: business.id, status: 'ACTIVE' },
      create: { ...product, businessId: business.id, status: 'ACTIVE' },
    });
  }

  const [awaAccount, clearingAccount] = await Promise.all([
    prisma.ledgerAccount.upsert({
      where: { ownerId: awa.id },
      update: {},
      create: { id: ids.awaAccount, code: `WALLET:${awa.id}`, ownerId: awa.id, type: 'USER_WALLET' },
    }),
    prisma.ledgerAccount.upsert({
      where: { code: 'SYSTEM:SANDBOX:XOF' },
      update: {},
      create: { id: ids.clearingAccount, code: 'SYSTEM:SANDBOX:XOF', type: 'PROVIDER_CLEARING' },
    }),
    prisma.ledgerAccount.upsert({
      where: { ownerId: moussa.id },
      update: {},
      create: { id: ids.moussaAccount, code: `WALLET:${moussa.id}`, ownerId: moussa.id, type: 'USER_WALLET' },
    }),
  ]);
  await prisma.walletOperation.upsert({
    where: { idempotencyKey: 'seed:awa:initial-balance' },
    update: {},
    create: {
      id: ids.initialTopUp,
      reference: 'RCH-ZAAMA-DEMO',
      idempotencyKey: 'seed:awa:initial-balance',
      initiatedById: awa.id,
      debitAccountId: clearingAccount.id,
      creditAccountId: awaAccount.id,
      type: 'TOP_UP',
      status: 'SUCCEEDED',
      provider: 'SANDBOX',
      providerReference: 'SBX-ZAAMA-DEMO',
      amountXof: 75000,
      label: 'Solde de démonstration ZAAMA',
      completedAt: new Date(),
      entries: {
        create: [
          { id: ids.initialTopUpDebit, accountId: clearingAccount.id, direction: 'DEBIT', amountXof: 75000 },
          { id: ids.initialTopUpCredit, accountId: awaAccount.id, direction: 'CREDIT', amountXof: 75000 },
        ],
      },
    },
  });

  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';
  await prisma.adminUser.upsert({
    where: { email: process.env.ADMIN_EMAIL ?? 'admin@saaga.local' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL ?? 'admin@saaga.local',
      passwordHash: await hash(adminPassword, 12),
      role: 'SUPER_ADMIN',
    },
  });

  process.stdout.write('Development seed ready: +22670000001 and +22670000002\n');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
