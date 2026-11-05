/**
 * VelvetAura E2E Test Fixtures
 * Authoritative test data definitions for luxury imported beauty products,
 * customer personas, mock payments, and mathematical pricing formulas.
 */

const sampleProducts = [
  {
    name: 'La Roche-Posay Hyalu B5 Pure Hyaluronic Acid Serum',
    brand: 'La Roche-Posay',
    origin: 'France',
    category: 'skincare',
    price: 39.99,
    description: 'Anti-aging serum with pure hyaluronic acid, madecassoside, and vitamin B5 for plump, hydrated skin.',
    stock: 45,
    rating: 4.8,
    image: '/assets/images/laroche-hyalu-b5.webp',
    specs: { volume: '30ml', skinType: 'All Skin Types', formulation: 'Serum' }
  },
  {
    name: 'Caudalie Vinoperfect Radiance Dark Spot Serum',
    brand: 'Caudalie',
    origin: 'France',
    category: 'skincare',
    price: 82.00,
    description: 'Cult-favorite brightening serum powered by patented Viniferine to visibly diminish dark spots.',
    stock: 30,
    rating: 4.9,
    image: '/assets/images/caudalie-vinoperfect.webp',
    specs: { volume: '30ml', skinType: 'Dull / Uneven', formulation: 'Milky Serum' }
  },
  {
    name: 'COSRX Advanced Snail 96 Mucin Power Essence',
    brand: 'COSRX',
    origin: 'South Korea',
    category: 'skincare',
    price: 25.00,
    description: 'Lightweight essence enriched with 96% snail secretion filtrate to soothe and intensely hydrate.',
    stock: 100,
    rating: 4.7,
    image: '/assets/images/cosrx-snail-96.webp',
    specs: { volume: '100ml', skinType: 'Sensitive / Dry', formulation: 'Essence' }
  },
  {
    name: 'Sulwhasoo First Care Activating Serum VI',
    brand: 'Sulwhasoo',
    origin: 'South Korea',
    category: 'skincare',
    price: 89.00,
    description: 'Iconic Korean post-cleanse boosting serum with JAUM Activator for youthful radiance.',
    stock: 25,
    rating: 4.9,
    image: '/assets/images/sulwhasoo-first-care.webp',
    specs: { volume: '60ml', skinType: 'Mature / Dry', formulation: 'Serum' }
  },
  {
    name: 'Shiseido Fino Premium Touch Hair Mask',
    brand: 'Shiseido',
    origin: 'Japan',
    category: 'haircare',
    price: 18.50,
    description: 'Intense rinse-off treatment infused with royal jelly EX and lipidure to repair damaged hair.',
    stock: 60,
    rating: 4.9,
    image: '/assets/images/shiseido-fino-mask.webp',
    specs: { volume: '230g', hairType: 'Damaged / Dry', formulation: 'Cream Mask' }
  },
  {
    name: 'Kérastase Elixir Ultime L\'Huile Original Hair Oil',
    brand: 'Kérastase',
    origin: 'France',
    category: 'haircare',
    price: 58.00,
    description: 'Sublime beautifying hair oil with wild camellia extract for incredible shine and frizz control.',
    stock: 40,
    rating: 4.8,
    image: '/assets/images/kerastase-elixir.webp',
    specs: { volume: '100ml', hairType: 'All Hair Types', formulation: 'Oil' }
  },
  {
    name: 'Maison Margiela REPLICA Jazz Club Eau de Toilette',
    brand: 'Maison Margiela',
    origin: 'France',
    category: 'fragrances',
    price: 160.00,
    description: 'Warm and spicy fragrance evoking heady cocktails and smoky cigar notes in a Brooklyn jazz club.',
    stock: 15,
    rating: 4.8,
    image: '/assets/images/margiela-jazz-club.webp',
    specs: { volume: '100ml', scentType: 'Warm & Spicy', notes: 'Pink Pepper, Rum, Tobacco Leaf' }
  },
  {
    name: 'Acqua di Parma Blu Mediterraneo Fico di Amalfi',
    brand: 'Acqua di Parma',
    origin: 'Italy',
    category: 'fragrances',
    price: 145.00,
    description: 'Enlivening Italian citrus fragrance capturing the breathtaking cliffs and fig trees of the Amalfi Coast.',
    stock: 20,
    rating: 4.7,
    image: '/assets/images/acqua-di-parma-fico.webp',
    specs: { volume: '75ml', scentType: 'Citrus Woody', notes: 'Bergamot, Fig Nectar, Cedarwood' }
  },
  {
    name: 'Rom&nd Zero Velvet Tint #06 Deepsoul',
    brand: 'Rom&nd',
    origin: 'South Korea',
    category: 'cosmetics',
    price: 13.00,
    description: 'Airy matte lip tint with a blurring velvet finish and deep burgundy red color payoff.',
    stock: 80,
    rating: 4.6,
    image: '/assets/images/romand-zero-velvet.webp',
    specs: { volume: '5.5g', finish: 'Matte Velvet', shade: '#06 Deepsoul' }
  },
  {
    name: 'Clé de Peau Beauté Concealer SPF 27',
    brand: 'Clé de Peau Beauté',
    origin: 'Japan',
    category: 'cosmetics',
    price: 75.00,
    description: 'Legendary full-coverage concealer stick with a seamless, radiant, skin-like finish.',
    stock: 35,
    rating: 4.9,
    image: '/assets/images/cle-de-peau-concealer.webp',
    specs: { volume: '5g', coverage: 'Full', finish: 'Radiant Natural' }
  }
];

const mockCards = {
  validVisa: {
    cardNumber: '4242424242424242',
    expiryDate: '12/28',
    cvv: '123',
    cardHolder: 'Camille Dupont',
    brand: 'Visa'
  },
  validMastercard: {
    cardNumber: '5555555555554444',
    expiryDate: '11/27',
    cvv: '456',
    cardHolder: 'Min-ji Park',
    brand: 'Mastercard'
  },
  declined: {
    cardNumber: '4000000000000002',
    expiryDate: '12/28',
    cvv: '000',
    cardHolder: 'Declined Cardholder',
    brand: 'Visa'
  },
  expired: {
    cardNumber: '4242424242424242',
    expiryDate: '01/20',
    cvv: '123',
    cardHolder: 'Expired Cardholder',
    brand: 'Visa'
  }
};

const shippingAddresses = {
  france: {
    street: '14 Rue de Rivoli',
    city: 'Paris',
    state: 'Ile-de-France',
    zip: '75001',
    country: 'France'
  },
  southKorea: {
    street: '450 Teheran-ro',
    city: 'Gangnam-gu',
    state: 'Seoul',
    zip: '06193',
    country: 'South Korea'
  },
  japan: {
    street: '3-5-1 Ginza',
    city: 'Chuo-ku',
    state: 'Tokyo',
    zip: '104-0061',
    country: 'Japan'
  },
  usa: {
    street: '742 Evergreen Terrace',
    city: 'Springfield',
    state: 'IL',
    zip: '62704',
    country: 'USA'
  },
  incomplete: {
    street: '',
    city: 'Paris',
    state: 'Ile-de-France',
    zip: '',
    country: 'France'
  }
};

/**
 * Generate a unique customer persona for test runs.
 */
function createUniqueUser(prefix = 'user') {
  const nonce = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  return {
    name: `Test ${prefix} ${nonce}`,
    email: `${prefix}_${nonce}@velvetaura.test`,
    password: 'Password123!',
    address: { ...shippingAddresses.usa }
  };
}

/**
 * Authoritative pricing calculation helper according to project specifications:
 * - Subtotal = sum(price * qty)
 * - Tax = 8% of subtotal, rounded half-up to 2 decimals
 * - Shipping = $0.00 if subtotal >= $50.00, else $5.99
 * - GrandTotal = subtotal + tax + shipping
 */
function calculateExpectedPricing(items) {
  const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const tax = Math.round(roundedSubtotal * 0.08 * 100) / 100;
  const shipping = roundedSubtotal >= 50.0 ? 0.0 : 5.99;
  const grandTotal = Math.round((roundedSubtotal + tax + shipping) * 100) / 100;

  return {
    subtotal: roundedSubtotal,
    tax,
    shipping,
    grandTotal
  };
}

module.exports = {
  sampleProducts,
  mockCards,
  shippingAddresses,
  createUniqueUser,
  calculateExpectedPricing
};
