import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Buat produk sample
  const products = await prisma.product.createMany({
    data: [
      {
        name: 'Netflix Premium 1 Bulan',
        slug: 'netflix-premium-1-bulan',
        description: 'Akun Netflix Premium untuk 1 bulan, kualitas 4K',
        priceIDR: 65000,
        isActive: true
      },
      {
        name: 'Spotify Premium 3 Bulan',
        slug: 'spotify-premium-3-bulan', 
        description: 'Akun Spotify Premium untuk 3 bulan, tanpa iklan',
        priceIDR: 45000,
        isActive: true
      },
      {
        name: 'Canva Pro 1 Tahun',
        slug: 'canva-pro-1-tahun',
        description: 'Akun Canva Pro untuk 1 tahun penuh',
        priceIDR: 120000,
        isActive: true
      }
    ]
  });

  // Tambah stok sample untuk produk pertama
  const product1 = await prisma.product.findFirst();
  if (product1) {
    await prisma.productCredential.createMany({
      data: [
        { productId: product1.id, payload: 'netflix-account-001@email.com:password123' },
        { productId: product1.id, payload: 'netflix-account-002@email.com:password456' },
        { productId: product1.id, payload: 'netflix-account-003@email.com:password789' }
      ]
    });
  }

  console.log(`✅ Created ${products.count} products with sample stock`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
