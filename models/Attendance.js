// models/Attendance.js
import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
    memberId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GymMember',
        required: true
    },
    checkIn: {
        type: Date,
        required: true
    },
    checkOut: {
        type: Date,
        default: null
    },
    duration: {
        type: Number,  // Duration in minutes
        default: null
    }
}, {
    timestamps: true
});

// Add indexes for better query performance
attendanceSchema.index({ memberId: 1, checkIn: -1 });
attendanceSchema.index({ checkIn: -1 });

export const getAttendanceModel = (connection) => {
    return connection.model('Attendance', attendanceSchema);
};