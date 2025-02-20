import mongoose from 'mongoose';

const replySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    userType: {
        type: String,
        enum: ['MANAGER', 'MEMBER'],
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const forumPostSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    userType: {
        type: String,
        enum: ['MANAGER', 'MEMBER'],
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    likes: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        userType: {
            type: String,
            enum: ['MANAGER', 'MEMBER'],
            required: true
        }
    }],
    replies: [replySchema],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create indexes for better query performance
forumPostSchema.index({ createdAt: -1 });
forumPostSchema.index({ userId: 1, userType: 1 });

export const getForumModel = (connection) => {
    return connection.model('ForumPost', forumPostSchema);
};