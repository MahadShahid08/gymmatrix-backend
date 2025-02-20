// File: controllers/authController.js

import { connectToInstitutionDB, checkInstitutionExists } from '../dbConnection.js';
import { getGymManagerModel } from '../models/GymManager.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv'
dotenv.config()

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const gymManagerAuthController = {
    // Middleware to verify JWT token
    authenticateManager: (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Connect to the institution's database
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

    // Register new gym manager
    registerManager: async (req, res) => {
        try {
            const { name, email, password, phoneNumber, institutionName } = req.body;
            // Check if institution already exists
        const exists = await checkInstitutionExists(institutionName);
        if (exists) {
            return res.status(400).json({ 
                message: "Institution name already registered. Please choose a different name.",
                field: "institutionName"
            });
        }

            if (!name || !email || !password || !phoneNumber || !institutionName) {
                return res.status(400).json({ message: "All fields are required" });
            }

            // Connect to the institution's database
            const connection = await connectToInstitutionDB(institutionName);
            const GymManager = getGymManagerModel(connection);

            // Check if a manager already exists for this institution
            const existingManager = await GymManager.findOne({});
            if (existingManager) {
                return res.status(400).json({ message: "Institution already has a manager registered" });
            }

            // Generate verification code
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const hashedVerificationCode = await bcrypt.hash(verificationCode, 10);

            // Create new manager
            const newManager = new GymManager({
                name,
                email,
                password, // Will be hashed by pre-save hook
                phoneNumber,
                isVerified: false,
                verificationCode: hashedVerificationCode,
                verificationCodeExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
            });

            await newManager.save();

            // Send verification email
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Gym Manager Registration Verification',
                html: `
                    <h1>Verify Your Gym Manager Account</h1>
                    <p>Thank you for registering as a gym manager. Your verification code is:</p>
                    <h2>${verificationCode}</h2>
                    <p>This code will expire in 24 hours.</p>
                    <p>Institution Name: ${institutionName}</p>
                `
            });

            res.status(201).json({
                message: "Registration successful. Please check your email for verification code.",
                managerId: newManager._id,
                institutionName
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ message: "Registration failed", error: error.message });
        }
    },

    // Verify manager's email with code
    verifyManager: async (req, res) => {
        try {
            const { managerId, verificationCode, institutionName } = req.body;

            if (!managerId || !verificationCode || !institutionName) {
                return res.status(400).json({ message: "All fields are required" });
            }

            const connection = await connectToInstitutionDB(institutionName);
            const GymManager = getGymManagerModel(connection);

            const manager = await GymManager.findById(managerId);
            if (!manager) {
                return res.status(404).json({ message: "Manager not found" });
            }

            if (manager.isVerified) {
                return res.status(400).json({ message: "Account already verified" });
            }

            if (!manager.verificationCode || !manager.verificationCodeExpires) {
                return res.status(400).json({ message: "No verification code found" });
            }

            if (manager.verificationCodeExpires < new Date()) {
                return res.status(400).json({ message: "Verification code expired" });
            }

            const isValidCode = await bcrypt.compare(verificationCode, manager.verificationCode);
            if (!isValidCode) {
                return res.status(400).json({ message: "Invalid verification code" });
            }

            // Update manager verification status
            manager.isVerified = true;
            manager.verificationCode = undefined;
            manager.verificationCodeExpires = undefined;
            await manager.save();

            // Generate token for automatic login after verification
            const token = jwt.sign(
                {
                    id: manager._id,
                    role: 'MANAGER',
                    institutionName
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                message: "Account verified successfully",
                token,
                user: {
                    id: manager._id,
                    name: manager.name,
                    email: manager.email,
                    institutionName,
                    role: 'MANAGER'
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
    
            // Check if institution exists first
            const exists = await checkInstitutionExists(institutionName);
            if (!exists) {
                return res.status(404).json({ message: "Institution not found" });
            }
    
            // Connect to the institution's database
            const connection = await connectToInstitutionDB(institutionName);
            const GymManager = getGymManagerModel(connection);

            // Find manager
            const manager = await GymManager.findOne({ email });
            if (!manager) {
                return res.status(404).json({ message: "Manager not found" });
            }

            // Check verification status
            if (!manager.isVerified) {
                return res.status(401).json({ message: "Account not verified" });
            }

            // Verify password
            const isValidPassword = await bcrypt.compare(password, manager.password);
            if (!isValidPassword) {
                return res.status(401).json({ message: "Invalid credentials" });
            }

            // Generate token
            const token = jwt.sign(
                {
                    id: manager._id,
                    role: 'MANAGER',
                    institutionName
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                token,
                user: {
                    id: manager._id,
                    name: manager.name,
                    email: manager.email,
                    institutionName,
                    role: 'MANAGER'
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: "Login failed", error: error.message });
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
            const connection = await connectToInstitutionDB(decoded.institutionName);
            const GymManager = getGymManagerModel(connection);

            const manager = await GymManager.findById(decoded.id);
            if (!manager || !manager.isVerified) {
                return res.status(403).json({ message: "Invalid token or unverified account" });
            }

            res.json({ 
                message: "Token is valid",
                user: {
                    id: manager._id,
                    name: manager.name,
                    email: manager.email,
                    institutionName: decoded.institutionName,
                    role: 'MANAGER'
                }
            });
        } catch (error) {
            console.error('Token verification error:', error);
            res.status(403).json({ message: "Invalid token" });
        }
    },

    // Request password reset
    requestPasswordReset: async (req, res) => {
        try {
            const { email, institutionName } = req.body;

            if (!email || !institutionName) {
                return res.status(400).json({ message: "Email and institution name are required" });
            }

            const connection = await connectToInstitutionDB(institutionName);
            const GymManager = getGymManagerModel(connection);

            const manager = await GymManager.findOne({ email });
            if (!manager) {
                return res.status(404).json({ message: "Manager not found" });
            }

            // Generate reset token
            const resetToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
            const hashedResetToken = await bcrypt.hash(resetToken, 10);

            // Save reset token and expiry
            manager.resetToken = hashedResetToken;
            manager.resetTokenExpiry = Date.now() + 3600000; // 1 hour
            await manager.save();

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

            const connection = await connectToInstitutionDB(institutionName);
            const GymManager = getGymManagerModel(connection);

            const manager = await GymManager.findOne({
                email,
                resetTokenExpiry: { $gt: Date.now() }
            });

            if (!manager) {
                return res.status(400).json({ message: "Invalid or expired reset token" });
            }

            // Verify reset token
            const isValidToken = await bcrypt.compare(resetToken, manager.resetToken);
            if (!isValidToken) {
                return res.status(400).json({ message: "Invalid reset token" });
            }

            // Update password
            manager.password = newPassword; // Will be hashed by pre-save hook
            manager.resetToken = undefined;
            manager.resetTokenExpiry = undefined;
            await manager.save();

            res.json({ 
                message: "Password reset successful",
                institutionName 
            });
        } catch (error) {
            console.error('Password reset error:', error);
            res.status(500).json({ message: "Failed to reset password" });
        }
    },

    // Logout (optional - can be handled client-side)
    logout: async (req, res) => {
        try {
            // Since we're using JWT, we can handle most logout functionality client-side
            // You can implement token blacklisting here if needed
            res.json({ message: "Logged out successfully" });
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({ message: "Logout failed" });
        }
    }
};