// models/PaymentHistory.js
import mongoose from 'mongoose';

const paymentHistorySchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GymMember',
        required: true
    },
    monthYear: {
        type: String,
        required: true
    },
    baseFees: {
        type: Number,
        required: true
    },
    personalTrainingFees: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    dueDate: {
        type: Date,
        required: true
    },
    paymentDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['PAID', 'PENDING', 'OVERDUE'],
        default: 'PENDING'
    },
    markedByManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GymManager',
        required: false
    }
}, {
    timestamps: true
});

export const getPaymentHistoryModel = (connection) => {
    return connection.model('PaymentHistory', paymentHistorySchema);
};
