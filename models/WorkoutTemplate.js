import mongoose from 'mongoose';

const exerciseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    sets: {
        type: Number,
        required: true
    },
    reps: {
        type: Number,
        required: true
    },
    targetMuscleGroup: {
        type: String,
        required: true
    },
    notes: {
        type: String
    }
});

const dayWorkoutSchema = new mongoose.Schema({
    day: {
        type: String,
        required: true,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    targetGroups: [{
        type: String,
        required: true
    }],
    exercises: [exerciseSchema]
});

const workoutTemplateSchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GymMember',
        required: true
    },
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GymManager',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date
    },
    isActive: {
        type: Boolean,
        default: true
    },
    weeklySchedule: [dayWorkoutSchema]
}, {
    timestamps: true
});

// Add indexes for better query performance
workoutTemplateSchema.index({ memberId: 1, isActive: 1 });
workoutTemplateSchema.index({ trainerId: 1, isActive: 1 });

export const getWorkoutTemplateModel = (connection) => {
    return connection.model('WorkoutTemplate', workoutTemplateSchema);
};