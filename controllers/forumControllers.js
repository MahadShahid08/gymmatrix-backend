import { connectToInstitutionDB } from '../dbConnection.js';
import { getForumModel } from '../models/Forum.js';
import { getGymManagerModel } from '../models/GymManager.js';
import { getGymMemberModel } from '../models/GymMember.js';

export const forumController = {
    // Get all posts for an institution
    getPosts: async (req, res) => {
        try {
            const { institutionName } = req.user;
            const connection = await connectToInstitutionDB(institutionName);
            const ForumPost = getForumModel(connection);

            const posts = await ForumPost.find()
                .sort({ createdAt: -1 })
                .lean();

            res.status(200).json(posts);
        } catch (error) {
            console.error('Error fetching posts:', error);
            res.status(500).json({ message: "Error fetching posts" });
        }
    },

    // Create a new post
    createPost: async (req, res) => {
        try {
            const { content } = req.body;
            const { id: userId, role: userType, institutionName } = req.user;

            if (!content) {
                return res.status(400).json({ message: "Content is required" });
            }

            const connection = await connectToInstitutionDB(institutionName);
            const ForumPost = getForumModel(connection);

            // Get user model based on role
            const UserModel = userType === 'MANAGER' 
                ? getGymManagerModel(connection) 
                : getGymMemberModel(connection);

            const user = await UserModel.findById(userId);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            const newPost = new ForumPost({
                content,
                userId,
                userType,
                userName: user.name
            });

            await newPost.save();
            res.status(201).json(newPost);
        } catch (error) {
            console.error('Error creating post:', error);
            res.status(500).json({ message: "Error creating post" });
        }
    },

    // Like a post
    likePost: async (req, res) => {
        try {
            const { postId } = req.params;
            const { id: userId, role: userType, institutionName } = req.user;

            const connection = await connectToInstitutionDB(institutionName);
            const ForumPost = getForumModel(connection);

            const post = await ForumPost.findById(postId);
            if (!post) {
                return res.status(404).json({ message: "Post not found" });
            }

            // Check if already liked
            const alreadyLiked = post.likes.some(like => 
                like.userId.toString() === userId && like.userType === userType
            );

            if (alreadyLiked) {
                return res.status(400).json({ message: "Post already liked" });
            }

            post.likes.push({ userId, userType });
            await post.save();

            res.json(post);
        } catch (error) {
            console.error('Error liking post:', error);
            res.status(500).json({ message: "Error liking post" });
        }
    },

    // Unlike a post
    unlikePost: async (req, res) => {
        try {
            const { postId } = req.params;
            const { id: userId, role: userType, institutionName } = req.user;

            const connection = await connectToInstitutionDB(institutionName);
            const ForumPost = getForumModel(connection);

            const post = await ForumPost.findById(postId);
            if (!post) {
                return res.status(404).json({ message: "Post not found" });
            }

            post.likes = post.likes.filter(like => 
                !(like.userId.toString() === userId && like.userType === userType)
            );
            await post.save();

            res.json(post);
        } catch (error) {
            console.error('Error unliking post:', error);
            res.status(500).json({ message: "Error unliking post" });
        }
    },

    // Add reply to a post
    replyToPost: async (req, res) => {
        try {
            const { postId } = req.params;
            const { content } = req.body;
            const { id: userId, role: userType, institutionName } = req.user;

            if (!content) {
                return res.status(400).json({ message: "Reply content is required" });
            }

            const connection = await connectToInstitutionDB(institutionName);
            const ForumPost = getForumModel(connection);

            // Get user model based on role
            const UserModel = userType === 'MANAGER' 
                ? getGymManagerModel(connection) 
                : getGymMemberModel(connection);

            const [post, user] = await Promise.all([
                ForumPost.findById(postId),
                UserModel.findById(userId)
            ]);

            if (!post) {
                return res.status(404).json({ message: "Post not found" });
            }

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            const newReply = {
                userId,
                userType,
                userName: user.name,
                content
            };

            post.replies.push(newReply);
            await post.save();

            res.json(post);
        } catch (error) {
            console.error('Error adding reply:', error);
            res.status(500).json({ message: "Error adding reply" });
        }
    },

    // Delete a post
    deletePost: async (req, res) => {
        try {
            const { postId } = req.params;
            const { id: userId, role: userType, institutionName } = req.user;

            const connection = await connectToInstitutionDB(institutionName);
            const ForumPost = getForumModel(connection);

            const post = await ForumPost.findById(postId);
            if (!post) {
                return res.status(404).json({ message: "Post not found" });
            }

            // Check if user is post owner
            if (post.userId.toString() !== userId || post.userType !== userType) {
                return res.status(403).json({ message: "Not authorized to delete this post" });
            }

            await ForumPost.findByIdAndDelete(postId);
            res.json({ message: "Post deleted successfully" });
        } catch (error) {
            console.error('Error deleting post:', error);
            res.status(500).json({ message: "Error deleting post" });
        }
    }
};