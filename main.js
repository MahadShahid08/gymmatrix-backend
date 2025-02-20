// main.js
import mongoose from "mongoose";
import express from "express";
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from "cookie-parser";
import schedule from 'node-schedule';
import { connectToInstitutionDB, checkInstitutionExists } from './dbConnection.js';
import { getGymMemberModel } from './models/GymMember.js';
import { getPaymentHistoryModel } from './models/PaymentHistory.js';
import { getGymManagerModel } from './models/GymManager.js';

// Import routes
import { AuthRouter } from './routes/authroutes.js';
import { MemberAuthRouter } from './routes/member-routes.js';
import { PaymentRouter } from './routes/payment-routes.js';
import { WorkoutPlanRouter } from './routes/workoutPlan.routes.js';
import { AttendanceRouter } from './routes/attendance-routes.js';
import { ForumRouter } from './routes/forum-routes.js';
// Add new imports for chat
import { getMessageModel } from './models/Messages.js';
import { getChatRequestModel } from './models/ChatRequest.js';
import { WorkoutTemplateRouter } from './routes/workoutTemplate-routes.js';



// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB Atlas");
    initializePaymentScheduler();
  })
  .catch((err) => {
    console.error("MongoDB Connection Error:", err);
  });

// Initialize payment scheduler
const initializePaymentScheduler = () => {
  // Schedule payment status initialization - Runs at midnight on the 5th of every month
  schedule.scheduleJob('0 0 5 * *', async () => {
    console.log('Running monthly payment initialization...');
    try {
      const adminDb = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
      const dbList = await adminDb.db.admin().listDatabases();
      await adminDb.close();

      for (const db of dbList.databases) {
        if (db.name.startsWith('gym_')) {
          const institutionName = db.name.replace('gym_', '');
          await initializeMonthlyPayments(institutionName);
        }
      }
    } catch (error) {
      console.error('Monthly payment initialization error:', error);
    }
  });

  // Schedule overdue status update - Runs at midnight on the 16th of every month
  schedule.scheduleJob('0 0 16 * *', async () => {
    console.log('Running overdue status update...');
    try {
      const adminDb = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
      const dbList = await adminDb.db.admin().listDatabases();
      await adminDb.close();

      for (const db of dbList.databases) {
        if (db.name.startsWith('gym_')) {
          const institutionName = db.name.replace('gym_', '');
          await updateOverdueStatus(institutionName);
        }
      }
    } catch (error) {
      console.error('Overdue status update error:', error);
    }
  });
};

// Helper function to initialize monthly payments
const initializeMonthlyPayments = async (institutionName) => {
  const connection = await connectToInstitutionDB(institutionName);
  const GymMember = getGymMemberModel(connection);
  const PaymentHistory = getPaymentHistoryModel(connection);

  const now = new Date();
  const monthYear = `${now.getMonth() + 1}-${now.getFullYear()}`;
  const dueDate = new Date(now.getFullYear(), now.getMonth(), 15); // Due on 15th

  const activeMembers = await GymMember.find({ isActive: true });
  
  for (const member of activeMembers) {
    const existingPayment = await PaymentHistory.findOne({
      memberId: member._id,
      monthYear
    });

    if (!existingPayment) {
      await PaymentHistory.create({
        memberId: member._id,
        monthYear,
        baseFees: member.baseFees,
        personalTrainingFees: member.personalTraining.trainerFees,
        totalAmount: member.baseFees + member.personalTraining.trainerFees,
        dueDate,
        status: 'PENDING'
      });
    }
  }
};

// Helper function to update overdue status
const updateOverdueStatus = async (institutionName) => {
  const connection = await connectToInstitutionDB(institutionName);
  const PaymentHistory = getPaymentHistoryModel(connection);

  const now = new Date();
  const monthYear = `${now.getMonth() + 1}-${now.getFullYear()}`;

  await PaymentHistory.updateMany(
    {
      monthYear,
      status: 'PENDING'
    },
    {
      $set: { status: 'OVERDUE' }
    }
  );
};

// CORS configuration
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (process.env.NODE_ENV === 'development') {
    console.log('Request body:', req.body);
  }
  next();
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    serverTime: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Register routes
app.use('/auth', AuthRouter);
app.use('/member-auth', MemberAuthRouter);
app.use('/api/workout-plan', WorkoutPlanRouter);
app.use('/api/payments', PaymentRouter);
app.use('/api/attendance', AttendanceRouter);
app.use('/api/forum', ForumRouter);
app.use('/api/workout-templates', WorkoutTemplateRouter);




// Development routes
if (process.env.NODE_ENV === 'development') {
  app.get('/debug/payment-status', async (req, res) => {
    try {
      const { institutionName } = req.query;
      if (!institutionName) {
        return res.status(400).json({ message: "Institution name is required" });
      }

      const connection = await connectToInstitutionDB(institutionName);
      const PaymentHistory = getPaymentHistoryModel(connection);

      const now = new Date();
      const monthYear = `${now.getMonth() + 1}-${now.getFullYear()}`;

      const payments = await PaymentHistory.find({ monthYear })
        .populate('memberId', 'name email')
        .select('status totalAmount dueDate paymentDate');

      res.json({
        monthYear,
        totalPayments: payments.length,
        payments
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log('\nServer started successfully');
  console.log(`Port: ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('Payment scheduler initialized');
  
  // Log registered routes in development
  if (process.env.NODE_ENV === 'development') {
    console.log('\nRegistered Routes:');
    app._router.stack
      .filter(r => r.route)
      .forEach(r => {
        console.log(`${Object.keys(r.route.methods).join(',')} ${r.route.path}`);
      });
  }
});

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  mongoose.connection.close();
  process.exit(0);
});