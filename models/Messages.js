// models/Message.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    senderRole: {
        type: String,
        enum: ['MANAGER', 'MEMBER'],
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    receiverRole: {
        type: String,
        enum: ['MANAGER', 'MEMBER'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    timeStamp: {
        type: Date,
        default: Date.now
    }
});

export const getMessageModel = (connection) => {
    return connection.model('Message', messageSchema);
};