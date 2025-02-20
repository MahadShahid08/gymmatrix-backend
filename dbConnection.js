// dbConnection.js
import mongoose from 'mongoose';

const connections = {};

export const checkInstitutionExists = async (institutionName) => {
    try {
        const dbName = `gym_${institutionName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const adminDb = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
        const dbList = await adminDb.db.admin().listDatabases();
        await adminDb.close();
        
        return dbList.databases.some(db => db.name === dbName);
    } catch (error) {
        console.error('Error checking institution:', error);
        return false;
    }
};

export const connectToInstitutionDB = async (institutionName) => {
    if (connections[institutionName]) {
        return connections[institutionName];
    }

    const dbName = `gym_${institutionName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const connectionURI = `${process.env.MONGODB_URI}${dbName}?retryWrites=true&w=majority`;

    try {
        const connection = await mongoose.createConnection(connectionURI, {
            autoCreate: false // Prevent automatic database creation
        });
        connections[institutionName] = connection;
        return connection;
    } catch (error) {
        console.error(`Failed to connect to database ${dbName}:`, error);
        throw error;
    }
};