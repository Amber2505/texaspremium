import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || '';
const options = {};

interface GlobalWithMongo {
  mongoClientPromise?: Promise<MongoClient>;
}

const globalWithMongo: GlobalWithMongo = global as GlobalWithMongo; // Use const instead of let

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your Mongo URI to .env.local');
}

if (process.env.NODE_ENV === 'development') {
  if (!globalWithMongo.mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo.mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo.mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;