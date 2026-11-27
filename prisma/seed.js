require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { PERMISSION_CATALOG, DEFAULT_ROLES, ROLE_NAMES } = require('../src/utils/permissions');

const prisma = new PrismaClient();
const isProd = process.env.NODE_ENV === 'production';
const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

const account = (prefix, defaults) => {
  const get = (k, d) => {
    const v = process.env[`SEED_${prefix}_${k}`];
    if (!v && isProd && k !== 'NAME') throw new Error(`SEED_${prefix}_${k} must be set in production`);
    return v || d;
  };
  return {
    name: get('NAME', defaults.name),
    email: get('EMAIL', defaults.email).toLowerCase(),
    password: get('PASSWORD', defaults.password),
  };
};

const SEED_USERS = [
  { roleName: ROLE_NAMES.ADMIN, ...account('ADMIN', { name: 'Virar Admin', email: 'admin@virarorganics.test', password: 'Admin@12345' }) },
  { roleName: ROLE_NAMES.SALES, ...account('SALES', { name: 'Sales Executive', email: 'sales@virarorganics.test', password: 'Sales@12345' }) },
  { roleName: ROLE_NAMES.CUSTOMER, ...account('CUSTOMER', { name: 'Demo Customer', email: 'customer@virarorganics.test', password: 'Customer@12345' }) },
];

async function main() {
  // 1. Permissions (idempotent)
  for (const perm of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description, group: perm.group, isSystem: true },
      create: { ...perm, isSystem: true },
    });
  }
  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idByKey = new Map(permissions.map((p) => [p.key, p.id]));

  // 2. Roles. Admin is always re-synced to ALL permissions; other roles get their
  //    defaults only on first creation so changes made via the admin API survive re-seeding.
  const roleIds = {};
  for (const def of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { name: def.name } });
    const role = existing
      ? await prisma.role.update({ where: { id: existing.id }, data: { description: def.description, isSystem: true } })
      : await prisma.role.create({ data: { name: def.name, description: def.description, isSystem: true } });
    roleIds[def.name] = role.id;

    if (!existing || def.name === ROLE_NAMES.ADMIN) {
      await prisma.rolePermission.createMany({
        data: def.permissions.map((key) => ({ roleId: role.id, permissionId: idByKey.get(key) })),
        skipDuplicates: true,
      });
    }
  }

  // 3. Users (never overwrite an existing account or password)
  for (const u of SEED_USERS) {
    const exists = await prisma.user.findUnique({ where: { email: u.email } });
    if (exists) {
      console.log(`  = ${u.roleName}: ${u.email} already exists`);
      continue;
    }
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, rounds),
        roleId: roleIds[u.roleName],
      },
    });
    console.log(`  + ${u.roleName}: ${u.email}`);
  }

  // 4. Sample Categories (idempotent)
  const SAMPLE_CATEGORIES = [
    { name: 'Cold-Pressed Oils', slug: 'cold-pressed-oils', description: 'Wood-pressed unrefined oils', sortOrder: 1 },
    { name: 'A2 Dairy & Ghee', slug: 'a2-dairy-ghee', description: 'Bilona A2 Gir cow ghee and dairy', sortOrder: 2 },
    { name: 'Organic Spices', slug: 'organic-spices', description: 'Single-origin farm spices', sortOrder: 3 },
    { name: 'Grains & Pulses', slug: 'grains-pulses', description: 'Unpolished grains, millets, and dals', sortOrder: 4 },
    { name: 'Natural Sweeteners', slug: 'natural-sweeteners', description: 'Raw honey and organic jaggery', sortOrder: 5 },
  ];

  const categoryBySlug = new Map();
  for (const cat of SAMPLE_CATEGORIES) {
    const saved = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    categoryBySlug.set(cat.slug, saved);
  }

  // 5. Sample Products (10 products, idempotent)
  const SAMPLE_PRODUCTS = [
    {
      name: 'Wood-Pressed Groundnut Oil (1L)',
      slug: 'wood-pressed-groundnut-oil-1l',
      sku: 'VO-OIL-GN-1L',
      shortDescription: 'Traditional lakdi ghani unrefined groundnut oil',
      price: 380,
      compareAtPrice: 420,
      unit: '1L',
      stock: 40,
      lowStockThreshold: 5,
      isFeatured: true,
      categorySlug: 'cold-pressed-oils',
    },
    {
      name: 'Cold-Pressed Virgin Coconut Oil (500ml)',
      slug: 'cold-pressed-virgin-coconut-oil-500ml',
      sku: 'VO-OIL-CC-500',
      shortDescription: 'Pure cold-pressed Konkan coconut oil',
      price: 320,
      compareAtPrice: 360,
      unit: '500ml',
      stock: 28,
      lowStockThreshold: 5,
      isFeatured: true,
      categorySlug: 'cold-pressed-oils',
    },
    {
      name: 'A2 Gir Cow Bilona Ghee (500ml)',
      slug: 'a2-gir-cow-bilona-ghee-500ml',
      sku: 'VO-GHEE-A2-500',
      shortDescription: 'Hand-churned curd bilona A2 ghee',
      price: 950,
      compareAtPrice: 1050,
      unit: '500ml',
      stock: 15,
      lowStockThreshold: 5,
      isFeatured: true,
      categorySlug: 'a2-dairy-ghee',
    },
    {
      name: 'A2 Gir Cow Bilona Ghee (1L)',
      slug: 'a2-gir-cow-bilona-ghee-1l',
      sku: 'VO-GHEE-A2-1L',
      shortDescription: 'Family pack hand-churned A2 ghee',
      price: 1800,
      compareAtPrice: 1990,
      unit: '1L',
      stock: 4,
      lowStockThreshold: 5,
      isFeatured: false,
      categorySlug: 'a2-dairy-ghee',
    },
    {
      name: 'Lakadong Turmeric Powder (250g)',
      slug: 'lakadong-turmeric-powder-250g',
      sku: 'VO-SPC-TUR-250',
      shortDescription: 'High-curcumin organic Lakadong haldi',
      price: 210,
      compareAtPrice: 240,
      unit: '250g',
      stock: 60,
      lowStockThreshold: 10,
      isFeatured: true,
      categorySlug: 'organic-spices',
    },
    {
      name: 'Malabar Black Peppercorns (200g)',
      slug: 'malabar-black-peppercorns-200g',
      sku: 'VO-SPC-PEP-200',
      shortDescription: 'Sun-dried whole organic black pepper',
      price: 260,
      compareAtPrice: null,
      unit: '200g',
      stock: 35,
      lowStockThreshold: 5,
      isFeatured: false,
      categorySlug: 'organic-spices',
    },
    {
      name: 'Unpolished Toor Dal (1kg)',
      slug: 'unpolished-toor-dal-1kg',
      sku: 'VO-GRN-TOOR-1K',
      shortDescription: 'Naturally grown unpolished pigeon peas',
      price: 220,
      compareAtPrice: 250,
      unit: '1kg',
      stock: 50,
      lowStockThreshold: 10,
      isFeatured: false,
      categorySlug: 'grains-pulses',
    },
    {
      name: 'Organic Indrayani Rice (2kg)',
      slug: 'organic-indrayani-rice-2kg',
      sku: 'VO-GRN-IND-2K',
      shortDescription: 'Aromatic Sahyadri Indrayani rice',
      price: 290,
      compareAtPrice: 320,
      unit: '2kg',
      stock: 32,
      lowStockThreshold: 5,
      isFeatured: true,
      categorySlug: 'grains-pulses',
    },
    {
      name: 'Raw Multiflora Forest Honey (500g)',
      slug: 'raw-multiflora-forest-honey-500g',
      sku: 'VO-SWT-HON-500',
      shortDescription: 'Unheated raw wild forest honey',
      price: 440,
      compareAtPrice: 490,
      unit: '500g',
      stock: 22,
      lowStockThreshold: 5,
      isFeatured: true,
      categorySlug: 'natural-sweeteners',
    },
    {
      name: 'Chemical-Free Kolhapuri Jaggery Powder (1kg)',
      slug: 'kolhapuri-jaggery-powder-1kg',
      sku: 'VO-SWT-JAG-1K',
      shortDescription: 'Natural sugarcane jaggery powder',
      price: 160,
      compareAtPrice: 185,
      unit: '1kg',
      stock: 45,
      lowStockThreshold: 10,
      isFeatured: false,
      categorySlug: 'natural-sweeteners',
    },
  ];

  const productBySku = new Map();
  for (const prod of SAMPLE_PRODUCTS) {
    const { categorySlug, ...fields } = prod;
    const saved = await prisma.product.upsert({
      where: { sku: fields.sku },
      update: {},
      create: { ...fields, categoryId: categoryBySlug.get(categorySlug).id },
    });
    productBySku.set(fields.sku, saved);
  }

  // 6. Sample Customer Address & 3 Orders (idempotent by orderNumber)
  const customerUser = await prisma.user.findUnique({ where: { email: SEED_USERS[2].email } });
  const salesUser = await prisma.user.findUnique({ where: { email: SEED_USERS[1].email } });

  if (customerUser) {
    const addrCount = await prisma.address.count({ where: { userId: customerUser.id } });
    if (addrCount === 0) {
      await prisma.address.create({
        data: {
          userId: customerUser.id,
          label: 'Home',
          fullName: customerUser.name,
          phone: '+91 9876543210',
          addressLine1: '102 Agashi Road, Virar West',
          city: 'Virar',
          state: 'Maharashtra',
          postalCode: '401303',
          country: 'India',
          isDefault: true,
        },
      });
    }

    const shippingSnapshot = {
      label: 'Home',
      fullName: customerUser.name,
      phone: '+91 9876543210',
      addressLine1: '102 Agashi Road, Virar West',
      city: 'Virar',
      state: 'Maharashtra',
      postalCode: '401303',
      country: 'India',
    };

    const pGhee = productBySku.get('VO-GHEE-A2-500');
    const pOil = productBySku.get('VO-OIL-GN-1L');
    const pHoney = productBySku.get('VO-SWT-HON-500');

    const SAMPLE_ORDERS = [
      {
        orderNumber: 'VO-SEED-0001',
        status: 'DELIVERED',
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'PAID',
        paidAt: new Date(),
        product: pGhee,
        quantity: 1,
      },
      {
        orderNumber: 'VO-SEED-0002',
        status: 'SHIPPED',
        paymentMethod: 'RAZORPAY',
        paymentStatus: 'PAID',
        paidAt: new Date(),
        product: pOil,
        quantity: 2,
      },
      {
        orderNumber: 'VO-SEED-0003',
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        paidAt: null,
        product: pHoney,
        quantity: 1,
      },
    ];

    for (const o of SAMPLE_ORDERS) {
      const exists = await prisma.order.findUnique({ where: { orderNumber: o.orderNumber } });
      if (!exists) {
        const unitPrice = Number(o.product.price);
        const total = Number((unitPrice * o.quantity).toFixed(2));
        await prisma.order.create({
          data: {
            orderNumber: o.orderNumber,
            userId: customerUser.id,
            status: o.status,
            paymentMethod: o.paymentMethod,
            paymentStatus: o.paymentStatus,
            paidAt: o.paidAt,
            subtotal: total,
            totalAmount: total,
            shippingAddress: shippingSnapshot,
            items: {
              create: [
                {
                  productId: o.product.id,
                  productName: o.product.name,
                  sku: o.product.sku,
                  unit: o.product.unit,
                  unitPrice,
                  quantity: o.quantity,
                  lineTotal: total,
                },
              ],
            },
          },
        });
      }
    }
  }

  // 7. Sample Bulk Enquiries & CRM Leads (5 leads, idempotent when leads table is empty)
  const existingLeadCount = await prisma.lead.count();
  if (existingLeadCount === 0) {
    const today = new Date();
    const pOil = productBySku.get('VO-OIL-GN-1L');
    const pGhee = productBySku.get('VO-GHEE-A2-500');
    const pTurmeric = productBySku.get('VO-SPC-TUR-250');
    const pRice = productBySku.get('VO-GRN-IND-2K');
    const pHoney = productBySku.get('VO-SWT-HON-500');

    const SAMPLE_LEADS = [
      {
        name: 'Rohan Kulkarni',
        phone: '+91 9820111101',
        email: 'rohan@freshmart.in',
        product: pOil,
        quantity: 50,
        message: 'Looking for monthly wholesale supply for 3 stores in Thane.',
        status: 'NEW',
        followUpDate: today,
        note: 'High priority retail chain enquiry.',
      },
      {
        name: 'Sneha Joshi',
        phone: '+91 9820111102',
        email: 'sneha@sattviccafe.in',
        product: pGhee,
        quantity: 25,
        message: 'Need A2 Bilona ghee bulk quote for restaurant kitchen.',
        status: 'CONTACTED',
        followUpDate: today,
        note: 'Shared bulk price sheet on WhatsApp; call back at 4 PM.',
      },
      {
        name: 'Vikram Sawant',
        phone: '+91 9820111103',
        email: 'vikram@ayurvedawellness.in',
        product: pTurmeric,
        quantity: 100,
        message: 'Export-grade Lakadong turmeric enquiry.',
        status: 'NEW',
        followUpDate: null,
        note: null,
      },
      {
        name: 'Priya Nair',
        phone: '+91 9820111104',
        email: 'priya@greenbasket.in',
        product: pRice,
        quantity: 80,
        message: 'Confirmed 80 packs for Diwali hamper.',
        status: 'CONVERTED',
        followUpDate: null,
        note: 'Converted to recurring B2B account.',
      },
      {
        name: 'Karan Mehta',
        phone: '+91 9820111105',
        email: 'karan@urbanfoods.in',
        product: pHoney,
        quantity: 15,
        message: 'Requested sample jars and wholesale discount.',
        status: 'LOST',
        followUpDate: null,
        note: 'Customer opted for local supplier due to lower MOQ.',
      },
    ];

    for (const item of SAMPLE_LEADS) {
      const enquiry = await prisma.bulkEnquiry.create({
        data: {
          name: item.name,
          phone: item.phone,
          email: item.email,
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          message: item.message,
        },
      });

      const lead = await prisma.lead.create({
        data: {
          enquiryId: enquiry.id,
          name: item.name,
          phone: item.phone,
          email: item.email,
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          message: item.message,
          status: item.status,
          followUpDate: item.followUpDate,
          assignedToId: salesUser?.id || null,
        },
      });

      if (item.note && salesUser) {
        await prisma.leadNote.create({
          data: {
            leadId: lead.id,
            authorId: salesUser.id,
            content: item.note,
          },
        });
      }
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
