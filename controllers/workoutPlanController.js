import { connectToInstitutionDB } from '../dbConnection.js';
import { getWorkoutPlanModel } from '../models/WorkoutPlan.js';
import { getGymMemberModel } from '../models/GymMember.js';
import { getGymManagerModel } from '../models/GymManager.js';
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv'
dotenv.config()

const groq = new Groq();
groq.apiKey = process.env.GROQ_API_KEY;

const generatePrompt = (data) => {
    return `Create a detailed workout plan for a person with the following specifications:
    - Current weight: ${data.currentWeight} kg
    - Target weight: ${data.targetWeight} kg
    - Height: ${data.height} cm
    - Workout goal: ${data.workoutType}
    - Fitness level: ${data.fitnessLevel}
    - Target duration: ${data.targetTimeInWeeks} weeks
    - Days per week: ${data.daysPerWeek}
    ${data.healthConditions.length ? `- Health conditions: ${data.healthConditions.join(', ')}` : ''}
    ${data.dietaryRestrictions.length ? `- Dietary restrictions: ${data.dietaryRestrictions.join(', ')}` : ''}

    Please provide a comprehensive plan including:
    1. Weekly workout schedule
    2. Detailed exercises for each day
    3. Sets and reps for each exercise
    4. Dietary recommendations
    5. Progress tracking metrics
    6. Safety precautions

    Format the response in a clear, structured way using markdown formatting.`;
};

export const workoutPlanController = {
    createPlan: async (req, res) => {
        try {
            const {
                memberEmail,
                currentWeight,
                targetWeight,
                height,
                workoutType,
                fitnessLevel,
                targetTimeInWeeks,
                daysPerWeek,
                healthConditions,
                dietaryRestrictions,
                institutionName
            } = req.body;

            if (!memberEmail) {
                return res.status(400).json({ message: "Member email is required" });
            }

            const connection = await connectToInstitutionDB(institutionName);
            const WorkoutPlan = getWorkoutPlanModel(connection);
            const GymMember = getGymMemberModel(connection);

            const member = await GymMember.findOne({ email: memberEmail });
            if (!member) {
                return res.status(404).json({ message: "Member not found" });
            }

            // Check if member has generated a plan today
            if (member.lastWorkoutPlanGenerated) {
                const lastGenerated = new Date(member.lastWorkoutPlanGenerated);
                const today = new Date();
                
                if (lastGenerated.toDateString() === today.toDateString()) {
                    return res.status(429).json({ 
                        message: "You can only generate one workout plan per day. Please try again tomorrow.",
                        nextAvailableTime: new Date(lastGenerated.getTime() + 24 * 60 * 60 * 1000)
                    });
                }
            }

            const prompt = generatePrompt(req.body);

            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a professional fitness trainer and nutritionist." },
                    { role: "user", content: prompt }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.7,
                max_tokens: 2048,
                top_p: 1,
                stream: false
            });

            const aiResponse = chatCompletion.choices[0].message.content;

            const newPlan = new WorkoutPlan({
                memberId: member._id,
                currentWeight,
                targetWeight,
                height,
                workoutType,
                fitnessLevel,
                targetTimeInWeeks,
                daysPerWeek,
                healthConditions,
                dietaryRestrictions,
                aiResponse,
                status: 'PENDING_REVIEW'
            });

            await newPlan.save();

            // Update member's last plan generation time
            member.lastWorkoutPlanGenerated = new Date();
            await member.save();

            res.status(201).json({
                message: "Workout plan created successfully",
                plan: newPlan
            });

        } catch (error) {
            console.error('Error creating workout plan:', error);
            res.status(500).json({ message: "Failed to create workout plan", error: error.message });
        }
    },

    getPlans: async (req, res) => {
        try {
            const { institutionName } = req.params;
            const { memberEmail } = req.query;

            if (!memberEmail) {
                return res.status(400).json({ message: "Member email is required" });
            }

            const connection = await connectToInstitutionDB(institutionName);
            const WorkoutPlan = getWorkoutPlanModel(connection);
            const GymMember = getGymMemberModel(connection);

            const member = await GymMember.findOne({ email: memberEmail });
            if (!member) {
                return res.status(404).json({ message: "Member not found" });
            }

            const plans = await WorkoutPlan.find({
                memberId: member._id
            }).sort({ createdAt: -1 });

            res.json(plans);
        } catch (error) {
            console.error('Error fetching workout plans:', error);
            res.status(500).json({ message: "Failed to fetch workout plans", error: error.message });
        }
    },

    getPendingPlans: async (req, res) => {
        try {
          const { institutionName } = req.params;
          console.log("Fetching plans for institution:", institutionName);
      
          if (!institutionName) {
            return res.status(400).json({ message: "Institution name is required" });
          }
      
          const connection = await connectToInstitutionDB(institutionName);
          const WorkoutPlan = getWorkoutPlanModel(connection);
          const GymMember = getGymMemberModel(connection);
      
          // Get pending plans with proper population
          const plans = await WorkoutPlan.find({
            status: 'PENDING_REVIEW'
          }).populate({
            path: 'memberId',
            model: GymMember,
            select: 'name email phoneNumber'
          });
      
          console.log("Found plans:", plans);
          
          // Always return an array, even if empty
          res.json(plans || []);
        } catch (error) {
          console.error('Error fetching pending plans:', error);
          res.status(500).json({ 
            message: "Failed to fetch pending plans", 
            error: error.message 
          });
        }
      },

    addManagerComment: async (req, res) => {
        try {
            const { planId, managerEmail, comment, institutionName } = req.body;

            if (!managerEmail) {
                return res.status(400).json({ message: "Manager email is required" });
            }

            const connection = await connectToInstitutionDB(institutionName);
            const WorkoutPlan = getWorkoutPlanModel(connection);
            const GymManager = getGymManagerModel(connection);

            const manager = await GymManager.findOne({ email: managerEmail });
            if (!manager) {
                return res.status(404).json({ message: "Manager not found" });
            }

            const plan = await WorkoutPlan.findById(planId);
            if (!plan) {
                return res.status(404).json({ message: "Workout plan not found" });
            }

            plan.managerComments.push({
                managerId: manager._id,
                comment
            });
            plan.status = 'NEEDS_MODIFICATION';

            await plan.save();

            res.json({
                message: "Comment added successfully",
                plan
            });
        } catch (error) {
            console.error('Error adding comment:', error);
            res.status(500).json({ message: "Failed to add comment", error: error.message });
        }
    },

    approvePlan: async (req, res) => {
        try {
            const { planId, managerEmail, institutionName } = req.body;

            if (!managerEmail) {
                return res.status(400).json({ message: "Manager email is required" });
            }

            const connection = await connectToInstitutionDB(institutionName);
            const WorkoutPlan = getWorkoutPlanModel(connection);
            const GymManager = getGymManagerModel(connection);

            const manager = await GymManager.findOne({ email: managerEmail });
            if (!manager) {
                return res.status(404).json({ message: "Manager not found" });
            }

            const plan = await WorkoutPlan.findById(planId);
            if (!plan) {
                return res.status(404).json({ message: "Workout plan not found" });
            }

            plan.status = 'APPROVED';
            await plan.save();

            res.json({
                message: "Plan approved successfully",
                plan
            });
        } catch (error) {
            console.error('Error approving plan:', error);
            res.status(500).json({ message: "Failed to approve plan", error: error.message });
        }
    }
};