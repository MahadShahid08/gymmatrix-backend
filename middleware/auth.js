// middleware/auth.js
import jwt from 'jsonwebtoken';
import { GymManager, GymMember } from '../models/index.js';

// Middleware to verify JWT token
export const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
};

// Middleware to verify if user is a manager
export const verifyManager = async (req, res, next) => {
    try {
        if (req.user.role !== 'MANAGER') {
            return res.status(403).json({ message: "Manager access required" });
        }

        const manager = await GymManager.findOne({ 
            _id: req.user.id,
            institutionName: req.user.institutionName,
            isVerified: true
        });

        if (!manager) {
            return res.status(403).json({ message: "Manager not found or not verified" });
        }

        next();
    } catch (error) {
        return res.status(500).json({ message: "Authentication error", error: error.message });
    }
};

// Middleware to verify if user is a member
export const verifyMember = async (req, res, next) => {
    try {
        if (req.user.role === 'MANAGER') {
            return res.status(403).json({ message: "Member access required" });
        }

        const member = await GymMember.findOne({ 
            _id: req.user.id,
            institutionName: req.user.institutionName,
            isApproved: true,
            isActive: true
        });

        if (!member) {
            return res.status(403).json({ message: "Member not found, not approved, or inactive" });
        }

        next();
    } catch (error) {
        return res.status(500).json({ message: "Authentication error", error: error.message });
    }
};

// Middleware to verify if user belongs to the same institution
export const verifyInstitution = async (req, res, next) => {
    try {
        const { institutionName } = req.user;
        
        if (!institutionName) {
            return res.status(403).json({ message: "Institution not specified" });
        }

        // Add institution to request for use in subsequent middleware/controllers
        req.institutionName = institutionName;
        
        next();
    } catch (error) {
        return res.status(500).json({ message: "Institution verification error", error: error.message });
    }
};