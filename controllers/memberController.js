// controllers/memberController.js
import { connectToInstitutionDB } from '../dbConnection.js';
import { getGymMemberModel } from '../models/GymMember.js';

export const memberController = {
    getAllMembers: async (req, res) => {
        try {
            const institutionName = req.user.institutionName;
            const { status, searchTerm } = req.query;

            const connection = await connectToInstitutionDB(institutionName);
            const GymMember = getGymMemberModel(connection);

            let query = {};

            if (status === 'active') {
                query.isActive = true;
            } else if (status === 'inactive') {
                query.isActive = false;
            }

            if (searchTerm) {
                query.$or = [
                    { name: { $regex: searchTerm, $options: 'i' } },
                    { email: { $regex: searchTerm, $options: 'i' } },
                    { phoneNumber: { $regex: searchTerm, $options: 'i' } }
                ];
            }

            const members = await GymMember.find(query)
                .select('-password')
                .populate('currentMonthPayment')
                .sort({ createdAt: -1 });

            res.json(members);

        } catch (error) {
            console.error('Members fetch error:', error);
            res.status(500).json({ message: "Failed to fetch members", error: error.message });
        }
    },

    getMemberDetails: async (req, res) => {
        try {
            const { memberId } = req.params;
            const institutionName = req.user.institutionName;

            const connection = await connectToInstitutionDB(institutionName);
            const GymMember = getGymMemberModel(connection);

            const member = await GymMember.findById(memberId)
                .select('-password')
                .populate('currentMonthPayment');

            if (!member) {
                return res.status(404).json({ message: "Member not found" });
            }

            res.json(member);

        } catch (error) {
            console.error('Member details fetch error:', error);
            res.status(500).json({ message: "Failed to fetch member details", error: error.message });
        }
    },

    updateMember: async (req, res) => {
        try {
            const { memberId } = req.params;
            const institutionName = req.user.institutionName;
            const updates = req.body;

            const connection = await connectToInstitutionDB(institutionName);
            const GymMember = getGymMemberModel(connection);

            // Remove fields that shouldn't be updated
            delete updates.password;
            delete updates.email;
            delete updates.isApproved;

            const member = await GymMember.findByIdAndUpdate(
                memberId,
                updates,
                { new: true, runValidators: true }
            ).select('-password');

            if (!member) {
                return res.status(404).json({ message: "Member not found" });
            }

            res.json({
                message: "Member updated successfully",
                member
            });

        } catch (error) {
            console.error('Member update error:', error);
            res.status(500).json({ message: "Failed to update member", error: error.message });
        }
    },

    updateTrainingStatus: async (req, res) => {
        try {
            const { memberId } = req.params;
            const { isEnrolled, trainerFees } = req.body;
            const institutionName = req.user.institutionName;

            const connection = await connectToInstitutionDB(institutionName);
            const GymMember = getGymMemberModel(connection);

            const member = await GymMember.findByIdAndUpdate(
                memberId,
                {
                    'personalTraining.isEnrolled': isEnrolled,
                    'personalTraining.trainerFees': trainerFees || 0
                },
                { new: true, runValidators: true }
            ).select('-password');

            if (!member) {
                return res.status(404).json({ message: "Member not found" });
            }

            res.json({
                message: "Training status updated successfully",
                member
            });

        } catch (error) {
            console.error('Training status update error:', error);
            res.status(500).json({ message: "Failed to update training status", error: error.message });
        }
    },

    toggleMemberStatus: async (req, res) => {
        try {
            const { memberId } = req.params;
            const institutionName = req.user.institutionName;

            const connection = await connectToInstitutionDB(institutionName);
            const GymMember = getGymMemberModel(connection);

            const member = await GymMember.findById(memberId);
            if (!member) {
                return res.status(404).json({ message: "Member not found" });
            }

            member.isActive = !member.isActive;
            await member.save();

            res.json({
                message: `Member ${member.isActive ? 'activated' : 'deactivated'} successfully`,
                member
            });

        } catch (error) {
            console.error('Member status toggle error:', error);
            res.status(500).json({ message: "Failed to toggle member status", error: error.message });
        }
    }
};