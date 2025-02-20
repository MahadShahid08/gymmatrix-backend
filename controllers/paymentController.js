// controllers/paymentController.js
import { connectToInstitutionDB } from '../dbConnection.js';
import { getGymMemberModel } from '../models/GymMember.js';
import { getPaymentHistoryModel } from '../models/PaymentHistory.js';
import schedule from 'node-schedule';
import mongoose from 'mongoose';
import {
  getCurrentMonthPaymentPeriod,
  shouldCreateNewPayments,
  shouldMarkOverdue
} from '../utils/paymentUtils.js';

export const paymentController = {
  // Schedule monthly payment status updates - run every day at midnight
  schedulePaymentUpdates: schedule.scheduleJob('0 0 * * *', async () => {
    const now = new Date();
    
    // Create new payment records on the 5th
    if (shouldCreateNewPayments(now)) {
      try {
        const { monthYear, dueDate } = getCurrentMonthPaymentPeriod();
        
        const adminDb = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
        const dbList = await adminDb.db.admin().listDatabases();
        await adminDb.close();
        
        for (const db of dbList.databases) {
          if (db.name.startsWith('gym_')) {
            const institutionName = db.name.replace('gym_', '');
            const connection = await connectToInstitutionDB(institutionName);
            const GymMember = getGymMemberModel(connection);
            const PaymentHistory = getPaymentHistoryModel(connection);
            
            // Get all active members
            const activeMembers = await GymMember.find({ isActive: true });
            
            // Create payment records for each member
            for (const member of activeMembers) {
              const existingPayment = await PaymentHistory.findOne({
                memberId: member._id,
                monthYear
              });
              
              if (!existingPayment) {
                const totalAmount = member.baseFees + member.personalTraining.trainerFees;
                await PaymentHistory.create({
                  memberId: member._id,
                  monthYear,
                  baseFees: member.baseFees,
                  personalTrainingFees: member.personalTraining.trainerFees,
                  totalAmount,
                  dueDate,
                  status: 'PENDING'
                });
              }
            }
          }
        }
        
        console.log(`Created new payment records for ${monthYear}`);
      } catch (error) {
        console.error('Error creating monthly payment records:', error);
      }
    }
    
    // Mark as overdue after the 15th
    if (shouldMarkOverdue(now)) {
      try {
        const { monthYear } = getCurrentMonthPaymentPeriod();
        
        const adminDb = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
        const dbList = await adminDb.db.admin().listDatabases();
        await adminDb.close();
        
        for (const db of dbList.databases) {
          if (db.name.startsWith('gym_')) {
            const institutionName = db.name.replace('gym_', '');
            const connection = await connectToInstitutionDB(institutionName);
            const PaymentHistory = getPaymentHistoryModel(connection);
            
            await PaymentHistory.updateMany(
              {
                monthYear,
                status: 'PENDING'
              },
              {
                $set: { status: 'OVERDUE' }
              }
            );
          }
        }
        
        console.log(`Marked overdue payments for ${monthYear}`);
      } catch (error) {
        console.error('Error updating overdue payments:', error);
      }
    }
  }),

  // Get all members with their payment status
  getAllMembersPaymentStatus: async (req, res) => {
    try {
      const institutionName = req.user.institutionName;
      const { status } = req.query;
      const paymentPeriod = getCurrentMonthPaymentPeriod();

      const connection = await connectToInstitutionDB(institutionName);
      const GymMember = getGymMemberModel(connection);
      const PaymentHistory = getPaymentHistoryModel(connection);

      const members = await GymMember.find({ isActive: true })
        .select('name email phoneNumber baseFees personalTraining joinDate');

      const membersWithPayments = await Promise.all(members.map(async (member) => {
        let payment = await PaymentHistory.findOne({
          memberId: member._id,
          monthYear: paymentPeriod.monthYear
        });

        if (!payment && paymentPeriod.shouldHavePaymentRecord) {
          const totalAmount = member.baseFees + member.personalTraining.trainerFees;
          payment = await PaymentHistory.create({
            memberId: member._id,
            monthYear: paymentPeriod.monthYear,
            baseFees: member.baseFees,
            personalTrainingFees: member.personalTraining.trainerFees,
            totalAmount,
            dueDate: paymentPeriod.dueDate,
            status: paymentPeriod.isOverdue ? 'OVERDUE' : 'PENDING'
          });
        } else if (payment?.status === 'PENDING' && paymentPeriod.isOverdue) {
          payment.status = 'OVERDUE';
          await payment.save();
        }

        return {
          ...member.toObject(),
          currentMonthPayment: payment
        };
      }));

      let filteredMembers = membersWithPayments;
      if (status) {
        filteredMembers = membersWithPayments.filter(
          member => member.currentMonthPayment?.status === status.toUpperCase()
        );
      }

      res.json(filteredMembers);

    } catch (error) {
      console.error('Members payment status fetch error:', error);
      res.status(500).json({ message: "Failed to fetch members payment status", error: error.message });
    }
  },

  // Get specific member's payment details and history
  getMemberPaymentDetails: async (req, res) => {
    try {
      const { memberId } = req.params;
      const institutionName = req.user.institutionName;
      const { monthYear } = getCurrentMonthPaymentPeriod();

      const connection = await connectToInstitutionDB(institutionName);
      const GymMember = getGymMemberModel(connection);
      const PaymentHistory = getPaymentHistoryModel(connection);

      const member = await GymMember.findById(memberId)
        .select('name email phoneNumber baseFees personalTraining joinDate');

      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      // Find or create current month payment
      let currentMonthPayment = await PaymentHistory.findOne({
        memberId,
        monthYear
      });

      if (!currentMonthPayment) {
        const dueDate = new Date();
        dueDate.setDate(15);

        currentMonthPayment = await PaymentHistory.create({
          memberId,
          monthYear,
          baseFees: member.baseFees,
          personalTrainingFees: member.personalTraining.trainerFees,
          totalAmount: member.baseFees + member.personalTraining.trainerFees,
          dueDate,
          status: 'PENDING'
        });
      }

      const paymentHistory = await PaymentHistory.find({ memberId })
        .sort({ monthYear: -1 })
        .limit(12);

      res.json({
        member,
        currentMonthPayment,
        paymentHistory
      });

    } catch (error) {
      console.error('Member payment details fetch error:', error);
      res.status(500).json({ message: "Failed to fetch member payment details", error: error.message });
    }
  },

  // Update member's payment status
  updatePaymentStatus: async (req, res) => {
    try {
      const { memberId } = req.params;
      const { status } = req.body;
      const managerId = req.user.id;
      const institutionName = req.user.institutionName;
      const { monthYear } = getCurrentMonthPaymentPeriod();

      const connection = await connectToInstitutionDB(institutionName);
      const PaymentHistory = getPaymentHistoryModel(connection);
      const GymMember = getGymMemberModel(connection);

      // First, find the member to get their fees
      const member = await GymMember.findById(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      // Find or create payment record for current month
      let payment = await PaymentHistory.findOne({
        memberId,
        monthYear
      });

      if (!payment) {
        // Create new payment record if it doesn't exist
        const dueDate = new Date();
        dueDate.setDate(15); // Set due date to 15th of current month

        payment = new PaymentHistory({
          memberId,
          monthYear,
          baseFees: member.baseFees,
          personalTrainingFees: member.personalTraining.trainerFees,
          totalAmount: member.baseFees + member.personalTraining.trainerFees,
          dueDate,
          status: 'PENDING',
          markedByManager: managerId
        });
      }

      // Check if already paid
      if (payment.status === 'PAID') {
        return res.status(400).json({ message: "Payment already marked as paid" });
      }

      // Update payment status
      payment.status = status;
      payment.paymentDate = new Date();
      payment.markedByManager = managerId;
      await payment.save();

      // Update member's current month payment reference
      member.currentMonthPayment = payment._id;
      await member.save();

      res.json({
        message: "Payment status updated successfully",
        payment
      });

    } catch (error) {
      console.error('Payment status update error:', error);
      res.status(500).json({ message: "Failed to update payment status", error: error.message });
    }
  },

  // Update member's fees
  updateMemberFees: async (req, res) => {
    try {
      const { memberId } = req.params;
      const { baseFees, trainerFees } = req.body;
      const institutionName = req.user.institutionName;

      const connection = await connectToInstitutionDB(institutionName);
      const GymMember = getGymMemberModel(connection);

      const member = await GymMember.findById(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      if (baseFees !== undefined) {
        member.baseFees = baseFees;
      }

      if (trainerFees !== undefined) {
        member.personalTraining.trainerFees = trainerFees;
      }

      await member.save();

      res.json({
        message: "Member fees updated successfully",
        member
      });

    } catch (error) {
      console.error('Member fees update error:', error);
      res.status(500).json({ message: "Failed to update member fees", error: error.message });
    }
  },

  // Get payment statistics
  getPaymentStatistics: async (req, res) => {
    try {
      const institutionName = req.user.institutionName;
      const { monthYear } = getCurrentMonthPaymentPeriod();

      const connection = await connectToInstitutionDB(institutionName);
      const PaymentHistory = getPaymentHistoryModel(connection);
      const GymMember = getGymMemberModel(connection);

      const [currentMonthPayments, totalMembers] = await Promise.all([
        PaymentHistory.find({ monthYear }).lean(),
        GymMember.countDocuments({ isActive: true })
      ]);

      const stats = {
        totalMembers,
        paidCount: currentMonthPayments.filter(p => p.status === 'PAID').length,
        pendingCount: currentMonthPayments.filter(p => p.status === 'PENDING').length,
        overdueCount: currentMonthPayments.filter(p => p.status === 'OVERDUE').length,
        totalExpectedAmount: currentMonthPayments.reduce((sum, p) => sum + p.totalAmount, 0),
        totalCollectedAmount: currentMonthPayments
          .filter(p => p.status === 'PAID')
          .reduce((sum, p) => sum + p.totalAmount, 0)
      };

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const historicalPayments = await PaymentHistory.aggregate([
        {
          $match: {
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: '$monthYear',
            totalCollected: {
              $sum: {
                $cond: [{ $eq: ['$status', 'PAID'] }, '$totalAmount', 0]
              }
            },
            totalExpected: { $sum: '$totalAmount' }
          }
        },
        { $sort: { _id: -1 } }
      ]);

      res.json({
        currentMonth: stats,
        history: historicalPayments
      });

    } catch (error) {
      console.error('Payment statistics fetch error:', error);
      res.status(500).json({
        message: "Failed to fetch payment statistics",
        error: error.message
      });
    }
  }
};