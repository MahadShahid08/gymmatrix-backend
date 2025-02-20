import { getWorkoutTemplateModel } from '../models/WorkoutTemplate.js';
import { getGymMemberModel } from '../models/GymMember.js';

export const workoutTemplateController = {
  getPersonalTrainingMembers: async (req, res) => {
    try {
        const GymMember = getGymMemberModel(req.dbConnection);
        
        const members = await GymMember.find({ 
            'personalTraining.isEnrolled': true,
            isActive: true
        }).select('name email phoneNumber personalTraining joinDate');

        // Get their template status
        const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
        const membersWithTemplateStatus = await Promise.all(members.map(async (member) => {
            const template = await WorkoutTemplate.findOne({
                memberId: member._id,
                isActive: true
            }).select('name createdAt');

            return {
                ...member.toObject(),
                currentTemplate: template || null
            };
        }));

        res.json(membersWithTemplateStatus);

    } catch (error) {
        console.error('Get PT members error:', error);
        res.status(500).json({ message: "Failed to fetch personal training members" });
    }
},
getMemberTemplateHistory: async (req, res) => {
  try {
      const { memberId } = req.params;
      
      const GymMember = getGymMemberModel(req.dbConnection);
      const member = await GymMember.findById(memberId);
      
      if (!member || !member.personalTraining.isEnrolled) {
          return res.status(404).json({ message: "Personal training member not found" });
      }

      const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
      const templates = await WorkoutTemplate.find({
          memberId,
          trainerId: req.user.id
      }).sort('-createdAt');

      res.json({
          member: {
              name: member.name,
              email: member.email,
              phoneNumber: member.phoneNumber,
              personalTraining: member.personalTraining
          },
          templates
      });

  } catch (error) {
      console.error('Get member history error:', error);
      res.status(500).json({ message: "Failed to fetch member's template history" });
  }
},
    // Create a new workout template

    createTemplate: async (req, res) => {
      try {
          const {
              memberId,
              name,
              description,
              weeklySchedule,
              startDate,
              endDate,
              makeActive = true // New parameter
          } = req.body;
  
          const GymMember = getGymMemberModel(req.dbConnection);
          const member = await GymMember.findById(memberId);
  
          if (!member) {
              return res.status(404).json({ message: "Member not found" });
          }
  
          if (!member.personalTraining.isEnrolled) {
              return res.status(403).json({ message: "Member is not enrolled in personal training" });
          }
  
          const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
  
          // Only deactivate other templates if this one is being created as active
          if (makeActive) {
              await WorkoutTemplate.updateMany(
                  { memberId, isActive: true },
                  { isActive: false }
              );
          }
  
          // Create new template
          const newTemplate = new WorkoutTemplate({
              memberId,
              trainerId: req.user.id,
              name,
              description,
              weeklySchedule,
              startDate: startDate || new Date(),
              endDate,
              isActive: makeActive
          });
  
          await newTemplate.save();
  
          // Fetch all templates to return updated list
          const templates = await WorkoutTemplate.find({
              memberId,
              trainerId: req.user.id
          }).sort('-createdAt');
  
          res.status(201).json({
              message: "Workout template created successfully",
              templates
          });
  
      } catch (error) {
          console.error('Create template error:', error);
          res.status(500).json({ message: "Failed to create workout template" });
      }
  },
    // Get all templates for a trainer
    getTrainerTemplates: async (req, res) => {
        try {
            const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
            
            const templates = await WorkoutTemplate.find({ 
                trainerId: req.user.id,
                isActive: true 
            })
            .populate('memberId', 'name email')
            .sort('-createdAt');

            res.json(templates);

        } catch (error) {
            console.error('Get trainer templates error:', error);
            res.status(500).json({ message: "Failed to fetch workout templates" });
        }
    },

    // Get member's active template
    getMemberTemplate: async (req, res) => {
        try {
            const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
            
            const template = await WorkoutTemplate.findOne({ 
                memberId: req.user.id,
                isActive: true 
            });

            if (!template) {
                return res.status(404).json({ message: "No active workout template found" });
            }

            res.json(template);

        } catch (error) {
            console.error('Get member template error:', error);
            res.status(500).json({ message: "Failed to fetch workout template" });
        }
    },
    setTemplateStatus: async (req, res) => {
      try {
          const { templateId } = req.params;
          const { isActive } = req.body;
  
          const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
          
          const template = await WorkoutTemplate.findOne({ 
              _id: templateId,
              trainerId: req.user.id
          });
  
          if (!template) {
              return res.status(404).json({ message: "Template not found" });
          }
  
          if (isActive) {
              // If activating this template, deactivate other active templates for this member
              await WorkoutTemplate.updateMany(
                  { 
                      memberId: template.memberId,
                      _id: { $ne: templateId },
                      isActive: true 
                  },
                  { isActive: false }
              );
          }
  
          template.isActive = isActive;
          await template.save();
  
          // Return updated list of templates
          const templates = await WorkoutTemplate.find({
              memberId: template.memberId,
              trainerId: req.user.id
          }).sort('-createdAt');
  
          res.json({
              message: `Template ${isActive ? 'activated' : 'deactivated'} successfully`,
              templates
          });
  
      } catch (error) {
          console.error('Template status update error:', error);
          res.status(500).json({ message: "Failed to update template status" });
      }
  },

    // Update a template
    updateTemplate: async (req, res) => {
      try {
          const { templateId } = req.params;
          const updateData = req.body;
  
          const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
          
          const template = await WorkoutTemplate.findOne({ 
              _id: templateId,
              trainerId: req.user.id
          });
  
          if (!template) {
              return res.status(404).json({ message: "Template not found" });
          }
  
          // Update template
          Object.assign(template, updateData);
          await template.save();
  
          // Fetch all templates for this member to return updated list
          const templates = await WorkoutTemplate.find({
              memberId: template.memberId,
              trainerId: req.user.id
          }).sort('-createdAt');
  
          res.json({
              message: "Template updated successfully",
              templates
          });
  
      } catch (error) {
          console.error('Update template error:', error);
          res.status(500).json({ message: "Failed to update workout template" });
      }
  },

    // Delete a template
    deleteTemplate: async (req, res) => {
        try {
            const { templateId } = req.params;

            const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
            
            const template = await WorkoutTemplate.findOne({ 
                _id: templateId,
                trainerId: req.user.id // Ensure trainer owns this template
            });

            if (!template) {
                return res.status(404).json({ message: "Template not found" });
            }

            // Instead of deleting, mark as inactive
            template.isActive = false;
            await template.save();

            res.json({ message: "Template deleted successfully" });

        } catch (error) {
            console.error('Delete template error:', error);
            res.status(500).json({ message: "Failed to delete workout template" });
        }
    },

    // Get template by ID
    getTemplateById: async (req, res) => {
        try {
            const { templateId } = req.params;

            const WorkoutTemplate = getWorkoutTemplateModel(req.dbConnection);
            
            const template = await WorkoutTemplate.findOne({ 
                _id: templateId,
                $or: [
                    { trainerId: req.user.id },
                    { memberId: req.user.id }
                ],
                isActive: true
            });

            if (!template) {
                return res.status(404).json({ message: "Template not found" });
            }

            res.json(template);

        } catch (error) {
            console.error('Get template by ID error:', error);
            res.status(500).json({ message: "Failed to fetch workout template" });
        }
    }
};