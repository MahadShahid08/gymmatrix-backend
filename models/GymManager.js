import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const gymManagerSchema = new mongoose.Schema({
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
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationCode: String,
    verificationCodeExpires: Date,
    resetToken: String,
    resetTokenExpiry: Date,
    role: {
        type: String,
        default: 'MANAGER'
    }
}, {
    timestamps: true
});

gymManagerSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

export const getGymManagerModel = (connection) => {
    return connection.model('GymManager', gymManagerSchema);
};