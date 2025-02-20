// models/ChatRequest.js
import mongoose from 'mongoose';

const chatRequestSchema = new mongoose.Schema({
  from: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
  },
  fromRole: {
      type: String,
      enum: ['MANAGER', 'MEMBER'],
      required: true
  },
  to: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
  },
  toRole: {
      type: String,
      enum: ['MANAGER', 'MEMBER'],
      required: true
  },
  message: String,
  status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
      default: 'PENDING'
  },
  timeStamp: {
      type: Date,
      default: Date.now
  }
});

export const getChatRequestModel = (connection) => {
  return connection.model('ChatRequest', chatRequestSchema);
};
