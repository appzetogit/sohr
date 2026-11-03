const mongoose = require('mongoose');

async function checkFood() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const db = mongoose.connection.db;
  const foods = await db.collection('foods').find({ name: /Biryani|Tart|Salmon/i }).toArray();
  console.log(JSON.stringify(foods, null, 2));

  process.exit(0);
}

checkFood().catch(console.error);
