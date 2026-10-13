import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';

// Seeds the single SOHR restaurant, its Prayagraj delivery zone and the full menu
// from scripts/data/sohr-menu.json. Safe to re-run: everything is upserted by name.

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error('Missing MONGO_URI or MONGODB_URI in Backend/.env');
}

const menu = JSON.parse(fs.readFileSync(new URL('./data/sohr-menu.json', import.meta.url), 'utf8'));
const info = menu.restaurant;
const LOGO_URL = 'https://sohr.in/sohr-logo.jpg';
const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Civil Lines, Prayagraj
const LAT = 25.4513;
const LNG = 81.8341;

// Delivery zone: a 16-point ring of ~15 km around Prayagraj city centre, covering
// Civil Lines, Naini, Jhunsi, Phaphamau and the Bamrauli airport area.
const CITY_CENTER = { lat: 25.4358, lng: 81.8463 };
const ZONE_RADIUS_KM = 15;

function ringAround({ lat, lng }, radiusKm, points = 16) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: points }, (_, i) => {
    const angle = (2 * Math.PI * i) / points;
    return {
      latitude: Number((lat + dLat * Math.sin(angle)).toFixed(5)),
      longitude: Number((lng + dLng * Math.cos(angle)).toFixed(5))
    };
  });
}

const zoneSeed = {
  name: 'Prayagraj',
  zoneName: 'Prayagraj',
  serviceLocation: 'Prayagraj, Uttar Pradesh',
  coordinates: ringAround(CITY_CENTER, ZONE_RADIUS_KM)
};

async function upsertZone() {
  return FoodZone.findOneAndUpdate(
    { name: zoneSeed.name, country: 'India' },
    {
      $set: {
        zoneName: zoneSeed.zoneName,
        serviceLocation: zoneSeed.serviceLocation,
        unit: 'kilometer',
        coordinates: zoneSeed.coordinates,
        isActive: true,
        country: 'India'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertRestaurant(zone) {
  const phoneDigits = info.phone.replace(/\D/g, '');
  const update = {
    restaurantName: info.name,
    // findOneAndUpdate skips the pre-validate hook, so set the derived fields here.
    restaurantNameNormalized: info.name.trim().toLowerCase(),
    ownerName: 'Vyas Ji',
    ownerPhone: phoneDigits,
    ownerPhoneDigits: phoneDigits,
    ownerPhoneLast10: phoneDigits.slice(-10),
    primaryContactNumber: phoneDigits,
    pureVegRestaurant: true,
    cuisines: ['North Indian', 'Chinese', 'Breakfast', 'Pure Veg'],
    profileImage: LOGO_URL,
    coverImage: LOGO_URL,
    coverImages: [LOGO_URL],
    openingTime: '00:00',
    closingTime: '23:59',
    openDays: ALL_DAYS,
    location: {
      type: 'Point',
      coordinates: [LNG, LAT],
      latitude: LAT,
      longitude: LNG,
      addressLine1: '48, 32, 3B, Tashkent Marg',
      area: 'Civil Lines',
      city: info.city,
      state: info.state,
      pincode: info.pincode,
      formattedAddress: info.address
    },
    estimatedDeliveryTime: '30 mins',
    zoneId: zone._id,
    status: 'approved',
    approvedAt: new Date(),
    isAcceptingOrders: true,
    onboardingFeePaid: true,
    businessModel: 'commission',
    subscriptionStatus: 'paid',
    subscriptionDueAmount: 0
  };

  return FoodRestaurant.findOneAndUpdate(
    { restaurantNameNormalized: update.restaurantNameNormalized },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

async function upsertOutletTimings(restaurant) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const timings = days.map((day) => ({ day, isOpen: true, openingTime: '00:00', closingTime: '23:59' }));
  await mongoose.connection.collection('food_restaurant_outlet_timings').updateOne(
    { restaurantId: restaurant._id },
    { $set: { restaurantId: restaurant._id, timings, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );
}

async function upsertMenu(restaurant) {
  let itemCount = 0;

  for (const [index, section] of menu.categories.entries()) {
    const category = await FoodCategory.findOneAndUpdate(
      { name: section.name, restaurantId: restaurant._id },
      {
        $set: {
          name: section.name,
          restaurantId: restaurant._id,
          type: 'food',
          foodTypeScope: 'Veg',
          approvalStatus: 'approved',
          isApproved: true,
          isActive: true,
          sortOrder: index + 1,
          approvedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    for (const [name, price] of section.items) {
      await FoodItem.findOneAndUpdate(
        { restaurantId: restaurant._id, name },
        {
          $set: {
            restaurantId: restaurant._id,
            categoryId: category._id,
            categoryName: category.name,
            name,
            price,
            foodType: 'Veg',
            isAvailable: true,
            approvalStatus: 'approved',
            approvedAt: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );
      itemCount++;
    }
  }

  return itemCount;
}

async function run() {
  await mongoose.connect(mongoUri);
  const zone = await upsertZone();
  const restaurant = await upsertRestaurant(zone);
  await upsertOutletTimings(restaurant);
  const itemCount = await upsertMenu(restaurant);
  console.log(`Zone: ${zone.name} (${zone._id})`);
  console.log(`Restaurant: ${restaurant.restaurantName} (${restaurant._id}) status=${restaurant.status}`);
  console.log(`Menu: ${menu.categories.length} categories, ${itemCount} items`);
}

run()
  .catch((err) => {
    console.error('Failed to seed SOHR:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
