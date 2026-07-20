require('dotenv').config();
const { connectPostgres } = require('../config/postgres');
const {
  User,
  PaymentMethod,
  Artwork,
  Collection,
  CollectionArtwork,
  Activity,
} = require('../models');
const { hashPassword } = require('../services/auth');

async function seed() {
  await connectPostgres();

  console.log('Seeding users...');
  const passwordHash = await hashPassword('password123');

  const [maya] = await User.findOrCreate({
    where: { username: 'mayasolano' },
    defaults: {
      username:           'mayasolano',
      email:              'maya@example.com',
      passwordHash,
      displayName:        'Maya Solano',
      bio:                "I make hand-dyed textile pieces and ink studies inspired by coastlines. Open for commissions — DM for custom pieces.",
      avatarUrl:          'https://picsum.photos/seed/avatar/200/200',
      location:           'Lisbon',
      showSalesPublicly:  true,
      twoFactorEnabled:   true,
    },
  });

  const [collector] = await User.findOrCreate({
    where: { username: 'collector_j' },
    defaults: {
      username:    'collector_j',
      email:       'collector_j@example.com',
      passwordHash,
      displayName: 'J. Collector',
    },
  });

  await PaymentMethod.findOrCreate({
    where:    { userId: maya.id, type: 'UPI' },
    defaults: { userId: maya.id, type: 'UPI', upiId: 'mayasolano@okhdfc' },
  });
  await PaymentMethod.findOrCreate({
    where:    { userId: maya.id, type: 'QR_CODE' },
    defaults: { userId: maya.id, type: 'QR_CODE' },
  });

  console.log('Seeding artworks...');
  const artworksData = [
    { title: 'Coastal Fragment I', description: 'Hand-dyed indigo textile study.',   price: 180, category: 'Textile',       imageUrl: 'https://picsum.photos/seed/a1/400/560', aiTags: ['indigo', 'coastal', 'textile'] },
    { title: 'Low Tide',           description: 'Ink on cotton rag paper.',           price: 95,  category: 'Painting',      imageUrl: 'https://picsum.photos/seed/a2/400/320', aiTags: ['ink', 'monochrome', 'coastal'] },
    { title: 'Salt Line',          description: 'Mixed media coastal series.',        price: 210, category: 'Painting',      imageUrl: 'https://picsum.photos/seed/a3/400/480', aiTags: ['mixed-media', 'coastal'] },
    { title: 'Weft & Weather',     description: 'Woven textile wall piece.',          price: 340, category: 'Textile',       imageUrl: 'https://picsum.photos/seed/a4/400/300', aiTags: ['woven', 'textile', 'wall-art'], status: 'sold' },
    { title: 'Estuary Sketch',     description: 'Quick plein-air ink study.',         price: 60,  category: 'Illustration',  imageUrl: 'https://picsum.photos/seed/a5/400/420', aiTags: ['sketch', 'plein-air'] },
    { title: 'Driftwood Form',     description: 'Small found-wood sculpture.',        price: 150, category: 'Sculpture',     imageUrl: 'https://picsum.photos/seed/a6/400/500', aiTags: ['driftwood', 'found-object'] },
    { title: 'Marsh Light',        description: 'Digital study, coastal palette.',    price: 75,  category: 'Digital',       imageUrl: 'https://picsum.photos/seed/a7/400/360', aiTags: ['digital', 'coastal', 'light'] },
    { title: 'Rope & Rust',        description: 'Photograph, harbour series.',        price: 120, category: 'Photography',   imageUrl: 'https://picsum.photos/seed/a8/400/440', aiTags: ['harbour', 'photography'] },
  ];

  const artworks = [];
  for (const data of artworksData) {
    const { aiTags, ...rest } = data;
    const [artwork] = await Artwork.findOrCreate({
      where:    { ownerId: maya.id, title: data.title },
      defaults: {
        ownerId: maya.id,
        ...rest,
        metadata: { ai_tags: aiTags || [], ai_generated_description: null, style_embedding: null },
      },
    });
    artworks.push(artwork);
  }

  console.log('Seeding a collection...');
  const [collection] = await Collection.findOrCreate({
    where:    { ownerId: maya.id, name: 'Coastal palette' },
    defaults: {
      ownerId:       maya.id,
      name:          'Coastal palette',
      coverImageUrl: artworks[0].imageUrl,
    },
  });
  // Add first 3 artworks to the collection (idempotent)
  for (let i = 0; i < 3; i++) {
    await CollectionArtwork.findOrCreate({
      where:    { collectionId: collection.id, artworkId: artworks[i].id },
      defaults: { collectionId: collection.id, artworkId: artworks[i].id, position: i },
    });
  }

  console.log('Seeding activities...');
  const existingActivities = await Activity.count({ where: { recipientId: maya.id } });
  if (existingActivities === 0) {
    await Activity.bulkCreate([
      {
        recipientId: maya.id,
        actorId:     collector.id,
        type:        'sale',
        artworkId:   artworks[3].id,
        amountCents: 34000,
      },
      {
        recipientId: maya.id,
        actorId:     collector.id,
        type:        'like',
        artworkId:   artworks[2].id,
      },
      {
        recipientId: maya.id,
        actorId:     collector.id,
        type:        'follow',
      },
    ]);
  }

  console.log('Seed complete. Login as mayasolano / password123');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
