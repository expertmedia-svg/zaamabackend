import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { UploadsService } from '../uploads/uploads.service';
import { MarketplaceService } from './marketplace.service';

describe('Marketplace product details', () => {
  it('loads an active product from a visible business', async () => {
    const product = { id: 'product', business: { id: 'shop' } };
    const findFirst = jest.fn().mockResolvedValue(product);
    const service = new MarketplaceService(
      { product: { findFirst } } as unknown as PrismaService,
      {} as UploadsService,
    );
    await expect(service.product('product')).resolves.toEqual(product);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'product',
        status: 'ACTIVE',
        business: { status: { in: ['VERIFIED', 'PENDING'] } },
      },
      include: {
        business: {
          select: { id: true, name: true, slug: true, status: true, city: true },
        },
      },
    });
  });

  it('returns 404 when the product is absent or unavailable', async () => {
    const service = new MarketplaceService(
      { product: { findFirst: jest.fn().mockResolvedValue(null) } } as unknown as PrismaService,
      {} as UploadsService,
    );
    await expect(service.product('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
