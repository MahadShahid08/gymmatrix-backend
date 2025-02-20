// controllers/attendanceController.js
import { getAttendanceModel } from '../models/Attendance.js';
import { getGymMemberModel } from '../models/GymMember.js';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

export const attendanceController = {
    getAttendanceStatus: async (req, res) => {
        try {
            const memberId = req.user.id;
            const Attendance = getAttendanceModel(req.dbConnection);

            const today = new Date();
            const existingCheckIn = await Attendance.findOne({
                memberId,
                checkOut: null,
                checkIn: {
                    $gte: startOfDay(today),
                    $lte: endOfDay(today)
                }
            });

            res.json({
                checkedIn: !!existingCheckIn,
                checkInTime: existingCheckIn ? existingCheckIn.checkIn : null
            });

        } catch (error) {
            console.error('Get attendance status error:', error);
            res.status(500).json({ message: "Failed to fetch attendance status" });
        }
    },
    // Member endpoints
    checkIn: async (req, res) => {
        try {
            const memberId = req.user.id;
            const Attendance = getAttendanceModel(req.dbConnection);
            const GymMember = getGymMemberModel(req.dbConnection);

            const member = await GymMember.findById(memberId);
            if (!member || !member.isActive) {
                return res.status(404).json({ message: "Member not found or inactive" });
            }

            const existingCheckIn = await Attendance.findOne({
                memberId,
                checkOut: null,
                checkIn: {
                    $gte: startOfDay(new Date()),
                    $lte: endOfDay(new Date())
                }
            });

            if (existingCheckIn) {
                return res.status(400).json({ message: "Already checked in" });
            }

            const attendance = new Attendance({
                memberId,
                checkIn: new Date()
            });

            await attendance.save();

            res.status(201).json({
                message: "Check-in successful",
                attendance
            });

        } catch (error) {
            console.error('Check-in error:', error);
            res.status(500).json({ message: "Check-in failed", error: error.message });
        }
    },

    checkOut: async (req, res) => {
        try {
            const memberId = req.user.id;  // Get from authenticated user
            const Attendance = getAttendanceModel(req.dbConnection);

            // Find active check-in
            const attendance = await Attendance.findOne({
                memberId,
                checkOut: null,
                checkIn: {
                    $gte: startOfDay(new Date()),
                    $lte: endOfDay(new Date())
                }
            });

            if (!attendance) {
                return res.status(404).json({ message: "No active check-in found" });
            }

            // Calculate duration
            const checkOut = new Date();
            const duration = Math.round((checkOut - attendance.checkIn) / (1000 * 60)); // Duration in minutes

            // Update attendance record
            attendance.checkOut = checkOut;
            attendance.duration = duration;
            await attendance.save();

            res.json({
                message: "Check-out successful",
                attendance
            });

        } catch (error) {
            console.error('Check-out error:', error);
            res.status(500).json({ message: "Check-out failed", error: error.message });
        }
    },

    getAttendanceHistory: async (req, res) => {
        try {
            const memberId = req.user.id;  // Get from authenticated user
            const Attendance = getAttendanceModel(req.dbConnection);

            const attendance = await Attendance.find({ memberId })
                .sort({ checkIn: -1 })
                .limit(30);  // Last 30 records

            res.json(attendance);

        } catch (error) {
            console.error('Fetch attendance history error:', error);
            res.status(500).json({ message: "Failed to fetch attendance history" });
        }
    },

    // Manager endpoints
    getAttendanceOverview: async (req, res) => {
        try {
            const Attendance = getAttendanceModel(req.dbConnection);
            const GymMember = getGymMemberModel(req.dbConnection);

            const today = new Date();
            const totalMembers = await GymMember.countDocuments({ isActive: true });
            const presentToday = await Attendance.countDocuments({
                checkIn: {
                    $gte: startOfDay(today),
                    $lte: endOfDay(today)
                }
            });

            const recentCheckins = await Attendance.find({
                checkIn: {
                    $gte: startOfDay(today),
                    $lte: endOfDay(today)
                }
            })
            .sort({ checkIn: -1 })
            .limit(5)
            .populate('memberId', 'name');

            res.json({
                totalMembers,
                presentToday,
                attendanceRate: (presentToday / totalMembers * 100).toFixed(1),
                recentCheckins
            });

        } catch (error) {
            console.error('Attendance overview error:', error);
            res.status(500).json({ message: "Failed to fetch attendance overview" });
        }
    },

    getMemberAttendance: async (req, res) => {
        try {
            const { memberId } = req.params;
            const { startDate, endDate } = req.query;
            
            const Attendance = getAttendanceModel(req.dbConnection);
            const GymMember = getGymMemberModel(req.dbConnection);

            // Verify member exists
            const member = await GymMember.findById(memberId);
            if (!member) {
                return res.status(404).json({ message: "Member not found" });
            }

            // Build date range query
            const dateQuery = {};
            if (startDate && endDate) {
                dateQuery.checkIn = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }

            const attendance = await Attendance.find({
                memberId,
                ...dateQuery
            }).sort({ checkIn: -1 });

            res.json({
                member: {
                    id: member._id,
                    name: member.name,
                    email: member.email
                },
                attendance
            });

        } catch (error) {
            console.error('Member attendance error:', error);
            res.status(500).json({ message: "Failed to fetch member attendance" });
        }
    },

    getDailyReport: async (req, res) => {
        try {
            const { date } = req.query;
            const targetDate = date ? new Date(date) : new Date();
            
            const Attendance = getAttendanceModel(req.dbConnection);
            const GymMember = getGymMemberModel(req.dbConnection);

            const allMembers = await GymMember.find({ isActive: true })
                .select('name email');

            const attendanceRecords = await Attendance.find({
                checkIn: {
                    $gte: startOfDay(targetDate),
                    $lte: endOfDay(targetDate)
                }
            }).populate('memberId', 'name');

            res.json({
                date: targetDate,
                totalMembers: allMembers.length,
                presentCount: attendanceRecords.length,
                absentCount: allMembers.length - attendanceRecords.length,
                records: attendanceRecords
            });

        } catch (error) {
            console.error('Daily report error:', error);
            res.status(500).json({ message: "Failed to fetch daily report" });
        }
    },

    getMonthlyReport: async (req, res) => {
        try {
            const { month, year } = req.query;
            const targetDate = month && year ? new Date(year, month - 1) : new Date();
            
            const Attendance = getAttendanceModel(req.dbConnection);
    
            const monthlyRecords = await Attendance.aggregate([
                {
                    $match: {
                        checkIn: {
                            $gte: startOfMonth(targetDate),
                            $lte: endOfMonth(targetDate)
                        }
                    }
                },
                {
                    $lookup: {
                        from: 'gymmembers', // This is correct as Mongoose automatically lowercases and pluralizes the model name
                        localField: 'memberId',
                        foreignField: '_id',
                        as: 'memberData'
                    }
                },
                {
                    $unwind: '$memberData'
                },
                {
                    $project: {
                        _id: 1,
                        memberId: 1,
                        checkIn: 1,
                        checkOut: 1,
                        duration: 1,
                        memberName: '$memberData.name' // Extract the name from memberData
                    }
                }
            ]);
    
            res.json({
                month: targetDate.getMonth() + 1,
                year: targetDate.getFullYear(),
                records: monthlyRecords
            });
    
        } catch (error) {
            console.error('Monthly report error:', error);
            res.status(500).json({ message: "Failed to fetch monthly report" });
        }
    }
};