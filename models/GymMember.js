// models/GymMember.js
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const paymentHistorySchema = new mongoose.Schema({
    monthYear: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    paymentDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['PAID', 'PENDING', 'OVERDUE'],
        default: 'PENDING'
    }
});

const gymMemberSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    isApproved: {
        type: Boolean,
        default: false
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    baseFees: {
        type: Number,
        required: true
    },
    lastWorkoutPlanGenerated: {
        type: Date,
        default: null
    },
    resetToken: String,
    resetTokenExpiry: Date,
    currency: {
        type: String,
        required: true,
        enum: ['USD', 'PKR', 'EUR', 'GBP', 'AUD', 'CAD']
    },
    personalTraining: {
        isEnrolled: {
            type: Boolean,
            default: false
        },
        trainerFees: {
            type: Number,
            default: 0
        }
    },
    paymentHistory: [paymentHistorySchema],
    currentMonthPayment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentHistory'
    },
    verificationCode: {
        type: String,
        required: false
    },
    verificationCodeExpiry: {
        type: Date,
        required: false
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

gymMemberSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

export const getGymMemberModel = (connection) => {
    return connection.model('GymMember', gymMemberSchema);
};