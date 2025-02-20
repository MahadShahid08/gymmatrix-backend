// models/PendingApproval.js
import mongoose from 'mongoose';

const pendingApprovalSchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GymMember',
        required: true
    },
    verificationPin: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['MEMBER', 'MANAGER'],
        required: true,
        default: 'MEMBER'
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(+new Date() + 24 * 60 * 60 * 1000) // 24 hours
    },
    isUsed: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Add TTL index for automatic document expiration
pendingApprovalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const getPendingApprovalModel = (connection) => {
    return connection.model('PendingApproval', pendingApprovalSchema);
};