// controllers/memberAuthController.js
import { connectToInstitutionDB, checkInstitutionExists } from '../dbConnection.js';
import { getGymMemberModel } from '../models/GymMember.js';
import { getGymManagerModel } from '../models/GymManager.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const gymMemberAuthController = {
    authenticateMember: (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            connectToInstitutionDB(decoded.institutionName)
                .then(connection => {
                    req.dbConnection = connection;
                    req.user = decoded;
                    next();
                })
                .catch(error => {
                    console.error('Authentication error:', error);
                    return res.status(403).json({ message: "Invalid token" });
                });
        } catch (error) {
            console.error('Authentication error:', error);
            return res.status(403).json({ message: "Invalid token" });
        }
    },
  registerMember: async (req, res) => {
    try {
        const { 
            name, 
            email, 
            password, 
            phoneNumber, 
            institutionName,
            baseFees,
            currency,
            personalTraining
        } = req.body;

        if (!name || !email || !password || !phoneNumber || !institutionName || !baseFees || !currency) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check if institution exists
        const exists = await checkInstitutionExists(institutionName);
        if (!exists) {
            return res.status(404).json({ message: "Institution not found" });
        }

        // Get institution's manager
        const connection = await connectToInstitutionDB(institutionName);
        const GymManager = getGymManagerModel(connection);
        const GymMember = getGymMemberModel(connection);

        const manager = await GymManager.findOne({ isVerified: true });
        if (!manager) {
            return res.status(404).json({ message: "No verified manager found for this institution" });
        }

        // Check if member exists
        const existingMember = await GymMember.findOne({ email });
        if (existingMember) {
            return res.status(400).json({ message: "Email already registered" });
        }

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Create new member
        const newMember = new GymMember({
            name,
            email,
            password,
            phoneNumber,
            baseFees,
            currency,
            verificationCode, // Store verification code
            verificationCodeExpiry: Date.now() + 3600000, // 1 hour expiry
            personalTraining: {
                isEnrolled: personalTraining?.isEnrolled || false,
                trainerFees: personalTraining?.trainerFees || 0
            }
        });

        await newMember.save();

        // Send verification code to manager
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: manager.email,
            subject: 'New Member Registration Approval',
            html: `
                <h1>New Member Registration Request</h1>
                <p>A new member has registered at your gym. Details:</p>
                <ul>
                    <li>Name: ${name}</li>
                    <li>Email: ${email}</li>
                    <li>Phone: ${phoneNumber}</li>
                    <li>Base Fees: ${baseFees} ${currency}</li>
                    <li>Personal Training: ${personalTraining?.isEnrolled ? 'Yes' : 'No'}</li>
                    ${personalTraining?.isEnrolled ? `<li>Trainer Fees: ${personalTraining.trainerFees} ${currency}</li>` : ''}
                </ul>
                <p>Approval code to share with member: <strong>${verificationCode}</strong></p>
            `
        });

        res.status(201).json({
            message: "Registration pending approval. Manager will provide verification code.",
            memberId: newMember._id
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: "Registration failed", error: error.message });
    }
},

verifyMember: async (req, res) => {
  try {
      const { memberId, verificationCode, institutionName } = req.body;

      if (!memberId || !verificationCode || !institutionName) {
          return res.status(400).json({ message: "All fields are required" });
      }

      const connection = await connectToInstitutionDB(institutionName);
      const GymMember = getGymMemberModel(connection);

      const member = await GymMember.findById(memberId);
      if (!member) {
          return res.status(404).json({ message: "Member not found" });
      }

      if (member.isApproved) {
          return res.status(400).json({ message: "Member already approved" });
      }

      // Check if verification code is correct and not expired
      if (
          member.verificationCode !== verificationCode || 
          !member.verificationCodeExpiry || 
          member.verificationCodeExpiry < Date.now()
      ) {
          return res.status(400).json({ message: "Invalid or expired verification code" });
      }

      member.isApproved = true;
      member.verificationCode = undefined;
      member.verificationCodeExpiry = undefined;
      await member.save();

      const token = jwt.sign(
          {
              id: member._id,
              role: 'MEMBER',
              institutionName
          },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
      );

      res.json({
          message: "Account verified successfully",
          token,
          user: {
              id: member._id,
              name: member.name,
              email: member.email,
              institutionName,
              role: 'MEMBER'
          }
      });

  } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({ message: "Verification failed", error: error.message });
  }
},
login: async (req, res) => {
    try {
        const { email, password, institutionName } = req.body;

        if (!email || !password || !institutionName) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const exists = await checkInstitutionExists(institutionName);
        if (!exists) {
            return res.status(404).json({ message: "Institution not found" });
        }

        const connection = await connectToInstitutionDB(institutionName);
        const GymMember = getGymMemberModel(connection);

        const member = await GymMember.findOne({ email });
        if (!member) {
            return res.status(404).json({ message: "Member not found" });
        }

        if (!member.isApproved) {
            return res.status(401).json({ message: "Account not approved" });
        }

        const isValidPassword = await bcrypt.compare(password, member.password);
        if (!isValidPassword) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            {
                id: member._id,
                role: 'MEMBER',
                institutionName
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: member._id,
                name: member.name,
                email: member.email,
                institutionName,
                role: 'MEMBER',
                personalTraining: member.personalTraining,
                isActive: member.isActive,
                baseFees: member.baseFees,
                currency: member.currency
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: "Login failed", error: error.message });
    }
},
    // Request password reset
    requestPasswordReset: async (req, res) => {
      try {
          const { email, institutionName } = req.body;

          if (!email || !institutionName) {
              return res.status(400).json({ message: "Email and institution name are required" });
          }

          // Check institution exists
          const exists = await checkInstitutionExists(institutionName);
          if (!exists) {
              return res.status(404).json({ message: "Institution not found" });
          }

          const connection = await connectToInstitutionDB(institutionName);
          const GymMember = getGymMemberModel(connection);

          const member = await GymMember.findOne({ email });
          if (!member) {
              return res.status(404).json({ message: "Member not found" });
          }

          // Generate reset token
          const resetToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
          const hashedResetToken = await bcrypt.hash(resetToken, 10);

          // Save reset token
          member.resetToken = hashedResetToken;
          member.resetTokenExpiry = Date.now() + 3600000; // 1 hour
          await member.save();

          // Send reset email
          await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: email,
              subject: 'Password Reset Request',
              html: `
                  <h1>Password Reset Request</h1>
                  <p>Use the following token to reset your password:</p>
                  <h2>${resetToken}</h2>
                  <p>This token will expire in 1 hour.</p>
                  <p>Institution: ${institutionName}</p>
              `
          });

          res.json({ 
              message: "Password reset instructions sent to email",
              institutionName
          });

      } catch (error) {
          console.error('Password reset request error:', error);
          res.status(500).json({ message: "Failed to process password reset request" });
      }
  },

  // Reset password
  resetPassword: async (req, res) => {
      try {
          const { email, resetToken, newPassword, institutionName } = req.body;

          if (!email || !resetToken || !newPassword || !institutionName) {
              return res.status(400).json({ message: "All fields are required" });
          }

          const exists = await checkInstitutionExists(institutionName);
          if (!exists) {
              return res.status(404).json({ message: "Institution not found" });
          }

          const connection = await connectToInstitutionDB(institutionName);
          const GymMember = getGymMemberModel(connection);

          const member = await GymMember.findOne({
              email,
              resetTokenExpiry: { $gt: Date.now() }
          });

          if (!member) {
              return res.status(400).json({ message: "Invalid or expired reset token" });
          }

          // Verify reset token
          const isValidToken = await bcrypt.compare(resetToken, member.resetToken);
          if (!isValidToken) {
              return res.status(400).json({ message: "Invalid reset token" });
          }

          // Update password
          member.password = newPassword;
          member.resetToken = undefined;
          member.resetTokenExpiry = undefined;
          await member.save();

          res.json({ 
              message: "Password reset successful",
              institutionName
          });

      } catch (error) {
          console.error('Password reset error:', error);
          res.status(500).json({ message: "Failed to reset password" });
      }
  },

  // Verify token validity
  verifyToken: async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const exists = await checkInstitutionExists(decoded.institutionName);
        if (!exists) {
            return res.status(404).json({ message: "Institution not found" });
        }

        const connection = await connectToInstitutionDB(decoded.institutionName);
        const GymMember = getGymMemberModel(connection);

        const member = await GymMember.findById(decoded.id);
        if (!member || !member.isApproved) {
            return res.status(403).json({ message: "Invalid token or unapproved account" });
        }

        res.json({ 
            message: "Token is valid",
            user: {
                id: member._id,
                name: member.name,
                email: member.email,
                institutionName: decoded.institutionName,
                role: 'MEMBER',
                personalTraining: member.personalTraining,
                isActive: member.isActive,
                baseFees: member.baseFees,
                currency: member.currency
            }
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(403).json({ message: "Invalid token" });
    }
},

  // Logout
  logout: async (req, res) => {
      try {
          res.json({ message: "Logged out successfully" });
      } catch (error) {
          console.error('Logout error:', error);
          res.status(500).json({ message: "Logout failed" });
      }
  }
};