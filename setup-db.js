const connectDB = require('./db');
const { Student, Test, Result } = connectDB;

const setupSchemas = async () => {
  try {
    console.log('Setting up MongoDB Schemas & Models...');

    await connectDB();
    await Promise.all([
      Student.init(),
      Test.init(),
      Result.init()
    ]);

    console.log('All MongoDB schemas and collections initialized successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error setting up MongoDB schemas:', err);
    process.exit(1);
  }
};

setupSchemas();