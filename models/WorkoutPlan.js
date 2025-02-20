import mongoose from 'mongoose';

const workoutPlanSchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GymMember',
        required: true
    },
    currentWeight: {
        type: Number,
        required: true
    },
    targetWeight: {
        type: Number,
        required: true
    },
    height: {
        type: Number,
        required: true
    },
    workoutType: {
        type: String,
        enum: ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS'],
        required: true
    },
    fitnessLevel: {
        type: String,
        enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'],
        required: true
    },
    targetTimeInWeeks: {
        type: Number,
        required: true
    },
    daysPerWeek: {
        type: Number,
        required: true,
        min: 1,
        max: 7
    },
    healthConditions: [{
        type: String
    }],
    dietaryRestrictions: [{
        type: String
    }],
    aiResponse: {
        type: String,
        required: true
    },
    managerComments: [{
        managerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'GymManager',
            required: true
        },
        comment: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    status: {
        type: String,
        enum: ['PENDING_REVIEW', 'APPROVED', 'NEEDS_MODIFICATION'],
        default: 'PENDING_REVIEW'
    }
}, {
    timestamps: true
});

export const getWorkoutPlanModel = (connection) => {
    return connection.model('WorkoutPlan', workoutPlanSchema);
};