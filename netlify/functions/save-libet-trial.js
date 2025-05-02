// --- Dependencies ---
const mongoose = require('mongoose');
// Only load dotenv for local development (Netlify uses UI env vars)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// --- MongoDB Connection Setup ---
let conn = null;
const mongoURI = process.env.MONGODB_URI; // Get URI from environment variable

if (!mongoURI) {
    console.error("FATAL ERROR: MONGODB_URI environment variable is not set.");
    // In a real app, you might prevent startup here, but in serverless,
    // the function will fail later if it's still not set.
}

// Function to establish DB connection (reuses existing if available)
const connectToDatabase = async () => {
  if (conn == null) {
    if (!mongoURI) { throw new Error("Database configuration error: MONGODB_URI not set."); }
    console.log('Creating new MongoDB connection...');
    // Adding options that might be useful, check Mongoose docs for current best practices
    conn = mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 5000 // Timeout after 5s instead of 30s
    }).then(() => mongoose);
    await conn; // Wait for the connection promise to resolve
    console.log('MongoDB connected.');
  }
  // console.log('Using existing MongoDB connection.');
  return conn;
};

// --- Mongoose Schema and Model ---
const libetTrialSchema = new mongoose.Schema({
  participantId: { type: String, required: [true, 'Participant ID is required.'], index: true },
  trial: { type: Number, required: [true, 'Trial number is required.'] },
  startPosition: { type: Number, required: true, min: 1, max: 60 },
  keyPressPosition: { type: Number, required: true, min: 1, max: 60 }, // W-Time
  intentionTime: { type: Number, required: true, min: 1, max: 60 },    // M-Time
  timestamp: { type: Date, default: Date.now }
});

// Create model, reusing if already compiled (important for serverless hot reloads)
const LibetTrial = mongoose.models.LibetTrial || mongoose.model('LibetTrial', libetTrialSchema);


// --- Netlify Function Handler ---
exports.handler = async (event, context) => {
  // 1. Set callbackWaitsForEmptyEventLoop to false for faster responses
  //    if you know your background processes (like DB connection) are handled.
  context.callbackWaitsForEmptyEventLoop = false;

  // 2. Allow only POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Allow': 'POST', 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Method Not Allowed. Please use POST.' })
    };
  }

  // 3. Parse incoming data
  let trialData;
  try {
    if (!event.body) { throw new Error("Request body is missing."); }
    trialData = JSON.parse(event.body);
    console.log('Function received data:', trialData);
  } catch (error) {
    console.error("Error parsing request body:", error);
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Invalid JSON format in request body.' }) };
  }

  // 4. Validate essential data structure (Mongoose handles detailed validation)
  if (!trialData || !trialData.participantId || typeof trialData.trial !== 'number' ||
      typeof trialData.startPosition !== 'number' || typeof trialData.keyPressPosition !== 'number' ||
      typeof trialData.intentionTime !== 'number') {
    console.error("Basic validation failed:", trialData);
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Missing or invalid required trial data fields.' }) };
  }

  // 5. Connect and Save to Database
  try {
    await connectToDatabase(); // Ensure connection is ready

    const newTrial = new LibetTrial(trialData);
    const savedTrial = await newTrial.save(); // Validate and save

    console.log(`Libet trial ${savedTrial.trial} for participant ${savedTrial.participantId} saved.`);

    // 6. Return Success Response
    return {
      statusCode: 201, // Created
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Trial data saved successfully.', trialId: savedTrial._id })
    };

  } catch (error) {
    console.error("Error saving to MongoDB:", error);

    // Handle Mongoose validation errors specifically
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return {
        statusCode: 400, // Bad Request
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Validation Error.', details: messages.join(', ') })
      };
    }

    // Handle other potential errors (e.g., database connection issues)
    return {
      statusCode: 500, // Internal Server Error
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'An internal error occurred while saving data.' })
    };
  }
};