'use strict';

// GYM BRUHS menu. Prices in cents. Macros per serving as sold (base option).
// Every item carries nutrition so the customer can see it before ordering.
// `swap` points at a healthier alternative and says why.
//
// Option groups render as drop-downs. `price` on a choice is the delta in cents.
// A group with `multi: true` lets the customer pick several (add-ons).

const CATEGORIES = [
  { id: 'shakes', en: 'Shakes & Smoothies', es: 'Batidos y Smoothies', emoji: '🥤' },
  { id: 'protein', en: 'Protein Snacks', es: 'Snacks con Proteína', emoji: '💪' },
  { id: 'fruit', en: 'Fruit & Veg', es: 'Fruta y Verdura', emoji: '🍎' },
  { id: 'nuts', en: 'Nuts & Bars', es: 'Nueces y Barras', emoji: '🥜' },
  { id: 'drinks', en: 'Hydration', es: 'Hidratación', emoji: '💧' },
];

const SIZE = {
  id: 'size',
  en: 'Size', es: 'Tamaño',
  choices: [
    { id: 's', en: 'Small (12 oz)', es: 'Chico (12 oz)', price: 0 },
    { id: 'm', en: 'Medium (16 oz)', es: 'Mediano (16 oz)', price: 150 },
    { id: 'l', en: 'Large (20 oz)', es: 'Grande (20 oz)', price: 250 },
  ],
};

const PROTEIN = {
  id: 'protein',
  en: 'Protein', es: 'Proteína',
  choices: [
    { id: 'whey', en: 'Whey (25 g)', es: 'Whey (25 g)', price: 0 },
    { id: 'plant', en: 'Plant protein (22 g)', es: 'Proteína vegetal (22 g)', price: 0 },
    { id: 'none', en: 'No protein', es: 'Sin proteína', price: -100 },
  ],
};

const SHAKE_ADDONS = {
  id: 'addons',
  en: 'Add-ons', es: 'Extras',
  multi: true,
  choices: [
    { id: 'pb', en: 'Peanut butter (+190 kcal)', es: 'Crema de cacahuate (+190 kcal)', price: 100 },
    { id: 'chia', en: 'Chia seeds (+60 kcal)', es: 'Semillas de chía (+60 kcal)', price: 75 },
    { id: 'oats', en: 'Oats (+75 kcal)', es: 'Avena (+75 kcal)', price: 50 },
    { id: 'creatine', en: 'Creatine 5 g', es: 'Creatina 5 g', price: 100 },
    { id: 'spinach', en: 'Spinach (+7 kcal)', es: 'Espinaca (+7 kcal)', price: 50 },
  ],
};

const ITEMS = [
  // ---- Shakes ----
  {
    id: 'shake-choc', category: 'shakes', emoji: '🍫',
    en: 'Choco Bruh Shake', es: 'Batido Choco Bruh',
    desc_en: 'Chocolate whey, banana, unsweetened almond milk, ice.',
    desc_es: 'Whey de chocolate, plátano, leche de almendra sin azúcar, hielo.',
    price: 699, kcal: 290, protein: 27, carbs: 31, sugar: 14, fat: 5,
    healthier: true,
    options: [SIZE, PROTEIN, SHAKE_ADDONS],
  },
  {
    id: 'shake-berry', category: 'shakes', emoji: '🫐',
    en: 'Berry Recovery', es: 'Recuperación de Moras',
    desc_en: 'Mixed berries, vanilla whey, Greek yogurt, water.',
    desc_es: 'Moras mixtas, whey de vainilla, yogurt griego, agua.',
    price: 699, kcal: 260, protein: 30, carbs: 24, sugar: 15, fat: 3,
    healthier: true,
    options: [SIZE, PROTEIN, SHAKE_ADDONS],
  },
  {
    id: 'shake-pbj', category: 'shakes', emoji: '🥜',
    en: 'PB&J Gains', es: 'PB&J Ganancias',
    desc_en: 'Peanut butter, strawberries, whey, oat milk.',
    desc_es: 'Crema de cacahuate, fresas, whey, leche de avena.',
    price: 749, kcal: 480, protein: 31, carbs: 42, sugar: 22, fat: 19,
    swap: { to: 'shake-berry', en: 'Berry Recovery saves ~220 kcal and 7 g sugar.', es: 'Berry Recovery ahorra ~220 kcal y 7 g de azúcar.' },
    options: [SIZE, PROTEIN, SHAKE_ADDONS],
  },
  {
    id: 'smoothie-green', category: 'shakes', emoji: '🥬',
    en: 'Green Machine', es: 'Máquina Verde',
    desc_en: 'Spinach, pineapple, mango, ginger, water. No added sugar.',
    desc_es: 'Espinaca, piña, mango, jengibre, agua. Sin azúcar añadida.',
    price: 649, kcal: 180, protein: 3, carbs: 42, sugar: 30, fat: 1,
    options: [SIZE, { ...PROTEIN, choices: PROTEIN.choices.map(c => (c.id === 'none' ? { ...c, price: 0 } : { ...c, price: 100 })) }],
  },

  // ---- Protein snacks ----
  {
    id: 'yogurt', category: 'protein', emoji: '🥛',
    en: 'Greek Yogurt Cup', es: 'Vaso de Yogurt Griego',
    desc_en: 'Plain 0% Greek yogurt, 7 oz. Pick a topping.',
    desc_es: 'Yogurt griego natural 0%, 7 oz. Elige un topping.',
    price: 399, kcal: 120, protein: 20, carbs: 7, sugar: 5, fat: 0,
    healthier: true,
    options: [{
      id: 'topping', en: 'Topping', es: 'Topping',
      choices: [
        { id: 'none', en: 'Plain', es: 'Natural', price: 0 },
        { id: 'berries', en: 'Fresh berries (+40 kcal)', es: 'Moras frescas (+40 kcal)', price: 100 },
        { id: 'granola', en: 'Low-sugar granola (+110 kcal)', es: 'Granola baja en azúcar (+110 kcal)', price: 100 },
        { id: 'honey', en: 'Honey drizzle (+60 kcal)', es: 'Miel (+60 kcal)', price: 50 },
      ],
    }],
  },
  {
    id: 'eggs', category: 'protein', emoji: '🥚',
    en: 'Hard-Boiled Eggs', es: 'Huevos Cocidos',
    desc_en: 'Two eggs, salt & pepper packet, everything seasoning optional.',
    desc_es: 'Dos huevos, sobre de sal y pimienta, sazón "everything" opcional.',
    price: 299, kcal: 140, protein: 12, carbs: 1, sugar: 1, fat: 10,
    healthier: true,
    options: [{
      id: 'count', en: 'How many', es: 'Cuántos',
      choices: [
        { id: '2', en: '2 eggs', es: '2 huevos', price: 0 },
        { id: '3', en: '3 eggs', es: '3 huevos', price: 125 },
        { id: '4', en: '4 eggs', es: '4 huevos', price: 225 },
      ],
    }],
  },
  {
    id: 'jerky', category: 'protein', emoji: '🥩',
    en: 'Turkey Jerky', es: 'Carne Seca de Pavo',
    desc_en: '1.5 oz bag. Lower sodium than beef jerky.',
    desc_es: 'Bolsa de 1.5 oz. Menos sodio que la de res.',
    price: 549, kcal: 120, protein: 19, carbs: 6, sugar: 5, fat: 2,
    options: [{
      id: 'flavor', en: 'Flavor', es: 'Sabor',
      choices: [
        { id: 'orig', en: 'Original', es: 'Original', price: 0 },
        { id: 'tj', en: 'Teriyaki', es: 'Teriyaki', price: 0 },
        { id: 'hot', en: 'Spicy', es: 'Picante', price: 0 },
      ],
    }],
  },
  {
    id: 'cottage', category: 'protein', emoji: '🧀',
    en: 'Cottage Cheese + Fruit', es: 'Queso Cottage con Fruta',
    desc_en: '2% cottage cheese, 6 oz, with pineapple or peaches.',
    desc_es: 'Queso cottage 2%, 6 oz, con piña o durazno.',
    price: 449, kcal: 190, protein: 22, carbs: 14, sugar: 11, fat: 4,
    healthier: true,
    options: [{
      id: 'fruit', en: 'Fruit', es: 'Fruta',
      choices: [
        { id: 'pine', en: 'Pineapple', es: 'Piña', price: 0 },
        { id: 'peach', en: 'Peaches', es: 'Durazno', price: 0 },
        { id: 'none', en: 'No fruit', es: 'Sin fruta', price: -50 },
      ],
    }],
  },

  // ---- Fruit & veg ----
  {
    id: 'apple-pb', category: 'fruit', emoji: '🍏',
    en: 'Apple Slices + Nut Butter', es: 'Manzana con Crema de Nuez',
    desc_en: 'One sliced apple with a 1 oz nut-butter cup.',
    desc_es: 'Una manzana en rebanadas con 1 oz de crema de nuez.',
    price: 399, kcal: 260, protein: 7, carbs: 31, sugar: 20, fat: 15,
    options: [{
      id: 'butter', en: 'Nut butter', es: 'Crema',
      choices: [
        { id: 'pb', en: 'Peanut butter', es: 'Cacahuate', price: 0 },
        { id: 'almond', en: 'Almond butter', es: 'Almendra', price: 75 },
        { id: 'none', en: 'Just the apple (95 kcal)', es: 'Solo manzana (95 kcal)', price: -150 },
      ],
    }],
  },
  {
    id: 'veggie-hummus', category: 'fruit', emoji: '🥕',
    en: 'Veggie Cup + Hummus', es: 'Verduras con Hummus',
    desc_en: 'Carrots, cucumber, bell pepper, 2 oz hummus.',
    desc_es: 'Zanahoria, pepino, pimiento, 2 oz de hummus.',
    price: 449, kcal: 170, protein: 6, carbs: 20, sugar: 6, fat: 8,
    healthier: true,
    options: [{
      id: 'hummus', en: 'Hummus', es: 'Hummus',
      choices: [
        { id: 'classic', en: 'Classic', es: 'Clásico', price: 0 },
        { id: 'roasted', en: 'Roasted red pepper', es: 'Pimiento asado', price: 0 },
        { id: 'jalapeno', en: 'Jalapeño', es: 'Jalapeño', price: 0 },
      ],
    }],
  },
  {
    id: 'fruit-cup', category: 'fruit', emoji: '🍉',
    en: 'Fresh Fruit Cup', es: 'Vaso de Fruta Fresca',
    desc_en: 'Melon, pineapple, grapes, berries. 8 oz.',
    desc_es: 'Melón, piña, uva, moras. 8 oz.',
    price: 449, kcal: 110, protein: 1, carbs: 27, sugar: 22, fat: 0,
    healthier: true,
    options: [{
      id: 'extra', en: 'Extra', es: 'Extra',
      choices: [
        { id: 'none', en: 'None', es: 'Nada', price: 0 },
        { id: 'tajin', en: 'Tajín', es: 'Tajín', price: 0 },
        { id: 'chamoy', en: 'Chamoy (+35 kcal, +8 g sugar)', es: 'Chamoy (+35 kcal, +8 g azúcar)', price: 50 },
      ],
    }],
  },

  // ---- Nuts & bars ----
  {
    id: 'almonds', category: 'nuts', emoji: '🌰',
    en: 'Almonds', es: 'Almendras',
    desc_en: '1 oz pack, about 23 almonds.',
    desc_es: 'Paquete de 1 oz, unas 23 almendras.',
    price: 249, kcal: 160, protein: 6, carbs: 6, sugar: 1, fat: 14,
    healthier: true,
    options: [{
      id: 'style', en: 'Style', es: 'Estilo',
      choices: [
        { id: 'raw', en: 'Raw, unsalted', es: 'Natural, sin sal', price: 0 },
        { id: 'roasted', en: 'Dry roasted, lightly salted', es: 'Tostadas, poca sal', price: 0 },
      ],
    }],
  },
  {
    id: 'trail-mix', category: 'nuts', emoji: '🥜',
    en: 'Trail Mix', es: 'Mezcla de Nueces y Frutas',
    desc_en: '2 oz. Nuts, raisins, dark chocolate chips.',
    desc_es: '2 oz. Nueces, pasas, chispas de chocolate oscuro.',
    price: 349, kcal: 290, protein: 8, carbs: 26, sugar: 16, fat: 18,
    swap: { to: 'almonds', en: 'Almonds: 15 g less sugar, 130 fewer kcal.', es: 'Almendras: 15 g menos azúcar, 130 kcal menos.' },
    options: [],
  },
  {
    id: 'protein-bar', category: 'nuts', emoji: '🍫',
    en: 'Protein Bar', es: 'Barra de Proteína',
    desc_en: '20 g protein, under 5 g sugar.',
    desc_es: '20 g de proteína, menos de 5 g de azúcar.',
    price: 349, kcal: 210, protein: 20, carbs: 22, sugar: 4, fat: 8,
    healthier: true,
    options: [{
      id: 'flavor', en: 'Flavor', es: 'Sabor',
      choices: [
        { id: 'choc', en: 'Chocolate', es: 'Chocolate', price: 0 },
        { id: 'cookie', en: 'Cookies & cream', es: 'Cookies & cream', price: 0 },
        { id: 'pb', en: 'Peanut butter', es: 'Cacahuate', price: 0 },
        { id: 'bday', en: 'Birthday cake', es: 'Pastel de cumpleaños', price: 0 },
      ],
    }],
  },
  {
    id: 'energy-bites', category: 'nuts', emoji: '🍪',
    en: 'Energy Bites (3)', es: 'Bolitas de Energía (3)',
    desc_en: 'Oats, dates, peanut butter, chia. Plant-based.',
    desc_es: 'Avena, dátil, crema de cacahuate, chía. Vegetal.',
    price: 399, kcal: 240, protein: 7, carbs: 30, sugar: 15, fat: 11,
    options: [],
  },

  // ---- Drinks ----
  {
    id: 'electrolyte', category: 'drinks', emoji: '⚡',
    en: 'Electrolyte Drink (0 sugar)', es: 'Bebida de Electrolitos (0 azúcar)',
    desc_en: '20 oz. Sodium, potassium, magnesium. Zero sugar.',
    desc_es: '20 oz. Sodio, potasio, magnesio. Cero azúcar.',
    price: 299, kcal: 10, protein: 0, carbs: 2, sugar: 0, fat: 0,
    healthier: true,
    options: [{
      id: 'flavor', en: 'Flavor', es: 'Sabor',
      choices: [
        { id: 'lemon', en: 'Lemon-lime', es: 'Limón', price: 0 },
        { id: 'berry', en: 'Berry', es: 'Moras', price: 0 },
        { id: 'orange', en: 'Orange', es: 'Naranja', price: 0 },
      ],
    }],
  },
  {
    id: 'water', category: 'drinks', emoji: '💧',
    en: 'Water', es: 'Agua',
    desc_en: 'Still or sparkling, 16.9 oz.',
    desc_es: 'Natural o mineral, 16.9 oz.',
    price: 149, kcal: 0, protein: 0, carbs: 0, sugar: 0, fat: 0,
    healthier: true,
    options: [{
      id: 'kind', en: 'Kind', es: 'Tipo',
      choices: [
        { id: 'still', en: 'Still', es: 'Natural', price: 0 },
        { id: 'sparkling', en: 'Sparkling', es: 'Mineral', price: 50 },
        { id: 'lime', en: 'Sparkling lime', es: 'Mineral con limón', price: 50 },
      ],
    }],
  },
  {
    id: 'coconut', category: 'drinks', emoji: '🥥',
    en: 'Coconut Water', es: 'Agua de Coco',
    desc_en: '11 oz, no added sugar. Natural potassium.',
    desc_es: '11 oz, sin azúcar añadida. Potasio natural.',
    price: 349, kcal: 60, protein: 0, carbs: 15, sugar: 11, fat: 0,
    options: [],
  },
  {
    id: 'coldbrew', category: 'drinks', emoji: '☕',
    en: 'Cold Brew', es: 'Café Cold Brew',
    desc_en: '16 oz black cold brew. Pick your milk.',
    desc_es: 'Cold brew negro de 16 oz. Elige tu leche.',
    price: 399, kcal: 5, protein: 0, carbs: 0, sugar: 0, fat: 0,
    options: [{
      id: 'milk', en: 'Milk', es: 'Leche',
      choices: [
        { id: 'none', en: 'Black', es: 'Negro', price: 0 },
        { id: 'almond', en: 'Almond milk (+15 kcal)', es: 'Leche de almendra (+15 kcal)', price: 50 },
        { id: 'oat', en: 'Oat milk (+45 kcal)', es: 'Leche de avena (+45 kcal)', price: 50 },
        { id: 'whole', en: 'Whole milk (+40 kcal)', es: 'Leche entera (+40 kcal)', price: 0 },
      ],
    }],
  },
];

const itemById = new Map(ITEMS.map(i => [i.id, i]));

/**
 * Price one order line from the server's menu (never trust client prices).
 * Returns { unitCents, lineCents, label } or throws with a user-safe message.
 */
function priceLine(line) {
  const item = itemById.get(line.itemId);
  if (!item) throw new Error(`Unknown item: ${String(line.itemId).slice(0, 40)}`);
  const qty = Number.isInteger(line.qty) ? line.qty : 0;
  if (qty < 1 || qty > 20) throw new Error(`Bad quantity for ${item.en}`);

  let unit = item.price;
  const chosen = {};
  const opts = line.options && typeof line.options === 'object' ? line.options : {};

  for (const group of item.options) {
    const raw = opts[group.id];
    if (group.multi) {
      const picks = Array.isArray(raw) ? raw : [];
      const ids = [...new Set(picks.map(String))];
      for (const id of ids) {
        const c = group.choices.find(ch => ch.id === id);
        if (!c) throw new Error(`Bad add-on for ${item.en}`);
        unit += c.price;
      }
      chosen[group.id] = ids;
    } else {
      // Single-select: default to the first choice when omitted.
      const id = raw === undefined || raw === null ? group.choices[0].id : String(raw);
      const c = group.choices.find(ch => ch.id === id);
      if (!c) throw new Error(`Bad ${group.en.toLowerCase()} for ${item.en}`);
      unit += c.price;
      chosen[group.id] = id;
    }
  }
  if (unit < 0) unit = 0;
  return { itemId: item.id, qty, options: chosen, unitCents: unit, lineCents: unit * qty };
}

module.exports = { CATEGORIES, ITEMS, itemById, priceLine };
