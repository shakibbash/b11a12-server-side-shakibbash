// ------------------ IMPORTS & CONFIG ------------------
const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 3000;


// ------------------ MIDDLEWARE ------------------
app.use(
  cors({
    origin: ['http://localhost:5173','https://forum-x-auth.web.app'], 
    methods: ["GET", "POST", "PUT", "DELETE","PATCH"],
    credentials: true,
  })
);
app.use(express.json());

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// ------------------ MONGODB CONNECTION ------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oeuxqwy.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, usersCollection, postsCollection, tagsCollection,notificationsCollection, commentsCollection, paymentsCollection, announcementsCollection,reportsCollection;

async function run() {
  try {
    await client.connect();
    db = client.db('forumDB');

    usersCollection = db.collection('users');
    postsCollection = db.collection('posts');
    tagsCollection = db.collection('tags');
    commentsCollection = db.collection('comments');
    paymentsCollection = db.collection('payments');
    announcementsCollection = db.collection('announcements');
    reportsCollection = db.collection("reports");
    notificationsCollection = db.collection("notifications"); 

  


      // Custom MiddleWares
    const verifyFirebaseToken = async(req , res , next) => {
      // console.log("Headers in middleware : " , req.headers)
      const authHeader = req.headers.authorization;

      if(!authHeader) {
        return res.status(401).send({message : "Unauthorized Access"})
      }

      const token = authHeader.split(' ')[1];

      if(!token){
        return res.status(401).send({message : "Unauthorized Access"})
      }

      try {
        // Verify The Token
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        
        next();
      } catch (error) {
        console.error('Token verification failed:', error);
        return res.status(401).send({message : "Invalid Token"});
      }
    }

//is a middleware for Express.js. Its purpose is to check whether the current user is an admin before allowing them to access certain route
    const verifyAdmin = async (req, res, next) => {
  const email = req.user?.email;   

  if (!email) {
    return res.status(401).send({ message: 'Unauthorized Access' });
  }

  const user = await usersCollection.findOne({ email });
  if (!user || user.role !== 'admin') {
    return res.status(403).send({ message: 'Forbidden Access' });
  }

  next();
};
// notifications apis

    app.get("/notifications/:userEmail",verifyFirebaseToken, async (req, res) => {
  try {
    const { userEmail } = req.params;
    const notifications = await notificationsCollection
      .find({ userEmail })
      .sort({ date: -1 })
      .toArray();
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

app.patch("/notifications/:id/read", verifyFirebaseToken,async (req, res) => {
  try {
    const { id } = req.params;
    await notificationsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { read: true } }
    );
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.patch("/notifications/:email/read-all",verifyFirebaseToken, async (req, res) => {
  try {
    const { email } = req.params;
    await notificationsCollection.updateMany(
      { userEmail: email },
      { $set: { read: true } }
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/notifications/:email/clear-all",verifyFirebaseToken, async (req, res) => {
  try {
    const { email } = req.params;
    await notificationsCollection.deleteMany({ userEmail: email });
    res.json({ message: "All notifications cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

    // ------------------ ADMIN APIs ------------------
    // Get all users with optional search
    app.get("/users", verifyFirebaseToken, verifyAdmin,  async (req, res) => {
      try {
        const search = req.query.search || "";
        const query = search ? { name: { $regex: search, $options: "i" } } : {};
        const users = await usersCollection.find(query).toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({ message: "Server Error" });
      }
    });

    // Admin stats
    app.get("/admin/stats", verifyFirebaseToken, verifyAdmin,  async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const totalPosts = await postsCollection.countDocuments();
        const totalComments = await commentsCollection.countDocuments();
        res.json({ totalUsers, totalPosts, totalComments });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    // Toggle user role
    app.patch("/admin/users/:id/toggle-role",  verifyFirebaseToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const user = await usersCollection.findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(404).json({ message: "User not found" });
        const newRole = user.role === "admin" ? "user" : "admin";
        await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role: newRole } });
        res.json({ message: `User role updated to ${newRole}`, role: newRole });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    // Get all reported comments
app.get("/admin/reports",  verifyFirebaseToken, verifyAdmin, async (req, res) => {
  try {
    const reports = await reportsCollection.find().sort({ date: -1 }).toArray();
    // Optionally, populate comment details
   const populatedReports = await Promise.all(
  reports.map(async (r) => {
    const comment = await commentsCollection.findOne({ _id: new ObjectId(r.commentId) });
    return { ...r, commentId: comment || null };  // fallback if comment deleted
  })
);
res.json(populatedReports);
;
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Take action on a report
app.patch("/admin/reports/:id/action",  verifyFirebaseToken, verifyAdmin, async (req, res) => {
  try {
    const { action } = req.body; // "Reviewed", "DeleteComment", "WarnUser", "Dismiss"
    const { id } = req.params;

    const report = await reportsCollection.findOne({ _id: new ObjectId(id) });
    if (!report) return res.status(404).json({ message: "Report not found" });

    switch(action) {
      case "Reviewed":
        await reportsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "Reviewed" } });
        break;
      case "DeleteComment":
        await commentsCollection.deleteOne({ _id: new ObjectId(report.commentId) });
        await reportsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "ActionTaken" } });
        break;
      case "WarnUser":
        // Optional: store warning in usersCollection
        await reportsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "ActionTaken" } });
        break;
      case "Dismiss":
        await reportsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: "Dismissed" } });
        break;
      default:
        return res.status(400).json({ message: "Invalid action" });
    }

    res.json({ message: "Action taken successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

    // ------------------ USER APIs ------------------
    // Create or update user
    app.post("/users", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          await usersCollection.updateOne({ email }, { $set: { last_login: new Date() } });
          return res.status(200).json({ message: "User exists, last_login updated", updated: true });
        }
        const newUser = { ...req.body, createdAt: new Date(), last_login: new Date() };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({ message: "User created", userId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
    });

    // Get single user
    app.get("/users/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    // Update user
    app.put("/users/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const updateData = req.body;
        const result = await usersCollection.updateOne({ email }, { $set: updateData });
        if (result.matchedCount === 0) return res.status(404).json({ message: "User not found" });
        res.json({ message: "User updated successfully" });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });

    // ------------------ POSTS APIs ------------------
    // Create post
    app.post("/posts",verifyFirebaseToken, async (req, res) => {
      try {
        const postData = req.body;
        if (!postData.authorEmail || !postData.title) return res.status(400).json({ message: "authorEmail and title are required" });
        const user = await usersCollection.findOne({ email: postData.authorEmail });
        if (!user) return res.status(404).json({ message: "User not found" });
        const userPostsCount = await postsCollection.countDocuments({ authorEmail: postData.authorEmail });
        if (!user.membership && userPostsCount >= 5) return res.status(403).json({ message: "Post limit reached. Become a member to post more." });
        postData.upVote = 0;
        postData.downVote = 0;
        postData.createdAt = new Date();
        const result = await postsCollection.insertOne(postData);
        res.status(201).json({ message: "Post created successfully", postId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
    });

    // Get all posts
    app.get("/posts", async (req, res) => {
      try {
        const posts = await postsCollection.find().sort({ createdAt: -1 }).toArray();
        res.json(posts);
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
    });

    // Get post details
    app.get("/posts/details/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const post = await postsCollection.findOne({ _id: new ObjectId(id) });
        if (!post) return res.status(404).json({ message: "Post not found" });
        const comments = await commentsCollection.find({ postId: id }).sort({ createdAt: 1 }).toArray();
        res.json({ ...post, comments });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get single post
    app.get("/posts/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const post = await postsCollection.findOne({ _id: new ObjectId(id) });
        if (!post) return res.status(404).json({ message: "Post not found" });
        res.json(post);
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
    });

    // Get posts by user
    app.get("/user-posts/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const posts = await postsCollection.aggregate([
          { $match: { authorEmail: email } },
          {
            $lookup: {
              from: "comments",
              let: { postId: { $toString: "$_id" } },
              pipeline: [{ $match: { $expr: { $eq: ["$postId", "$$postId"] } } }],
              as: "comments",
            },
          },
          { $addFields: { commentCount: { $size: "$comments" } } },
          { $project: { comments: 0 } },
          { $sort: { createdAt: -1 } },
        ]).toArray();
        res.json(posts);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // Delete post
    app.delete("/posts/:id", verifyFirebaseToken,async (req, res) => {
      const { id } = req.params;
      try {
        const result = await postsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ error: "Post not found" });
        res.json({ message: "Post deleted successfully" });
      } catch (err) {
        res.status(500).json({ error: "Invalid ID" });
      }
    });

    // Vote on post
    app.patch("/posts/vote/:id",verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      const { type, userEmail } = req.body;
      if (!["upvote", "downvote"].includes(type)) return res.status(400).json({ error: "Invalid vote type" });
      if (!userEmail) return res.status(400).json({ error: "User email is required" });

      try {
        const post = await postsCollection.findOne({ _id: new ObjectId(id) });
        if (!post) return res.status(404).json({ error: "Post not found" });

        const votes = post.votes || [];
        const existingVote = votes.find(v => v.userEmail === userEmail);

        let upVote = post.upVote || 0;
        let downVote = post.downVote || 0;
        let newVotes;

        if (!existingVote) {
          newVotes = [...votes, { userEmail, voteType: type }];
          type === "upvote" ? upVote++ : downVote++;
        } else if (existingVote.voteType === type) {
          newVotes = votes.filter(v => v.userEmail !== userEmail);
          type === "upvote" ? upVote-- : downVote--;
        } else {
          newVotes = votes.map(v => v.userEmail === userEmail ? { ...v, voteType: type } : v);
          type === "upvote" ? (upVote++, downVote--) : (downVote++, upVote--);
        }

        await postsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { upVote, downVote, votes: newVotes } });
        res.json({ upVote, downVote });
      } catch (err) {
        res.status(500).json({ error: "Server error" });
      }
    });



// ------------------ SEARCH & FILTER APIs ------------------

// Search posts by tag name
app.get("/posts/by-tag/:tagName", async (req, res) => {
  try {
    const { tagName } = req.params;
    
    if (!tagName) {
      return res.status(400).json({ message: "Tag name is required" });
    }

    const posts = await postsCollection.find({ 
      tags: { $regex: tagName, $options: 'i' } 
    }).sort({ createdAt: -1 }).toArray();

    res.json(posts);
  } catch (error) {
    console.error("Posts by tag error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Search tags by name (for search bar)
app.get("/tags/search", async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const tags = await tagsCollection.find({
      name: { $regex: q, $options: 'i' }
    }).limit(10).toArray();

    res.json(tags);
  } catch (error) {
    console.error("Tag search error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get tags with post counts
app.get("/tags/with-counts", async (req, res) => {
  try {
    const tagsWithCounts = await postsCollection.aggregate([
      { $unwind: "$tags" },
      { $group: { 
          _id: "$tags", 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: -1 } },
      { $project: { 
          name: "$_id", 
          count: 1, 
          _id: 0 
        } 
      }
    ]).toArray();

    res.json(tagsWithCounts);
  } catch (error) {
    console.error("Tags with counts error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});








    // Popular posts
    app.get("/posts/popular", async (req, res) => {
      try {
        const posts = await postsCollection.aggregate([
          { $lookup: { from: "comments", localField: "_id", foreignField: "postId", as: "comments" } },
          { $addFields: { commentCount: { $size: "$comments" }, voteDifference: { $subtract: ["$upVote", "$downVote"] } } },
          { $project: { comments: 0 } },
          { $sort: { voteDifference: -1, createdAt: -1 } },
        ]).toArray();
        res.json(posts);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // Pagination
    app.get("/posts/page/:page", async (req, res) => {
      const page = parseInt(req.params.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const skip = (page - 1) * limit;
      try {
        const posts = await postsCollection.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
        const total = await postsCollection.countDocuments();
        res.json({ posts, total });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ------------------ COMMENTS APIs ------------------
    // Get comments
    app.get("/comments", async (req, res) => {
      try {
        const { postId } = req.query;
        const comments = await commentsCollection.find({ postId }).sort({ createdAt: 1 }).toArray();
        res.json(comments);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // Add comment/reply
    app.post("/comments",verifyFirebaseToken, async (req, res) => {
      try {
        const { postId, text, userEmail, userName, userPhoto, parentId = null } = req.body;
        if (!postId || !text || !userEmail) return res.status(400).json({ message: "Missing fields" });
        const newComment = { postId, parentId, text, userEmail, userName, userPhoto, upvotes: 0, downvotes: 0, reported: false, feedback: [], replies: [], createdAt: new Date() };
        const result = await commentsCollection.insertOne(newComment);
        res.status(201).json({ message: "Comment added", commentId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // Vote on comment
    app.patch("/comments/vote/:id",verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      const { type, userEmail } = req.body;
      const comment = await commentsCollection.findOne({ _id: new ObjectId(id) });
      if (!comment) return res.status(404).send({ error: "Comment not found" });

      let upvoters = comment.upvoters || [];
      let downvoters = comment.downvoters || [];

      if (type === "upvote") {
        if (upvoters.includes(userEmail)) upvoters = upvoters.filter(u => u !== userEmail);
        else { upvoters.push(userEmail); downvoters = downvoters.filter(u => u !== userEmail); }
      } else if (type === "downvote") {
        if (downvoters.includes(userEmail)) downvoters = downvoters.filter(u => u !== userEmail);
        else { downvoters.push(userEmail); upvoters = upvoters.filter(u => u !== userEmail); }
      }

      const result = await commentsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { upvoters, downvoters, upvotes: upvoters.length, downvotes: downvoters.length } });
      res.send(result);
    });

    
 // Report comment
app.patch("/comments/report/:id", verifyFirebaseToken,async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail, reason } = req.body;

    if (!userEmail || !reason) {
      return res.status(400).json({ message: "userEmail and reason are required" });
    }

    // Find the reported comment
    const comment = await commentsCollection.findOne({ _id: new ObjectId(id) });
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Mark comment as reported
    await commentsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { reported: true } }
    );

    // Insert into reports collection
    await reportsCollection.insertOne({
      commentId: id,
      reportedBy: userEmail,
      reason,
      date: new Date(),
      status: "Pending"
    });


    await notificationsCollection.insertOne({
      userEmail: comment.userEmail, // the user who made the comment
      message: `Your comment has been reported for: "${reason}"`,
      date: new Date(),
      read: false,
    });

    res.json({ message: "Comment reported and notification sent successfully" });
  } catch (err) {
    console.error("Report comment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


    // Edit comment
    app.patch("/comments/:id",verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { text, userEmail } = req.body;
        if (!text) return res.status(400).json({ message: "Text is required" });
        const comment = await commentsCollection.findOne({ _id: new ObjectId(id) });
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        if (comment.userEmail !== userEmail) return res.status(403).json({ message: "You can only edit your own comment" });
        await commentsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { text } });
        res.json({ message: "Comment updated successfully" });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // Delete comment
    app.delete("/comments/:id",verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { userEmail } = req.body;
        const comment = await commentsCollection.findOne({ _id: new ObjectId(id) });
        if (!comment) return res.status(404).json({ message: "Comment not found" });
        if (comment.userEmail !== userEmail) return res.status(403).json({ message: "You can only delete your own comment" });
        await commentsCollection.deleteOne({ _id: new ObjectId(id) });
        res.json({ message: "Comment deleted successfully" });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ------------------ ANNOUNCEMENTS APIs ------------------
    // Create, get, update, delete
    app.post("/announcements", async (req, res) => {
      try {
        const announcement = { ...req.body };
        const result = await announcementsCollection.insertOne(announcement);
        const savedAnnouncement = await announcementsCollection.findOne({ _id: result.insertedId });
        res.status(201).json(savedAnnouncement);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/announcements/count", async (req, res) => {
      try {
        const count = await announcementsCollection.countDocuments();
        res.json({ count });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/announcements", async (req, res) => {
      try {
        const announcements = await announcementsCollection.find().sort({ createdAt: -1 }).toArray();
        res.json(announcements);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.patch("/announcements/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { title, description } = req.body;
        if (!title || !description) return res.status(400).json({ error: "Title and description are required" });
        const result = await announcementsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { title, description, updatedAt: new Date() } });
        if (result.matchedCount === 0) return res.status(404).json({ error: "Announcement not found" });
        res.json({ success: true, message: "Announcement updated successfully" });
      } catch (error) {
        res.status(500).json({ error: "Failed to update announcement" });
      }
    });

    app.delete("/announcements/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await announcementsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Announcement not found" });
        res.json({ message: "Announcement deleted successfully" });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ------------------ TAGS APIs ------------------
    app.post("/tags", async (req, res) => {
      try {
        const tags = req.body.tags;
        if (!tags || !Array.isArray(tags)) return res.status(400).json({ message: "Tags array is required" });
        for (let t of tags) {
          if (!(await tagsCollection.findOne({ name: t }))) await tagsCollection.insertOne({ name: t });
        }
        res.status(201).json({ message: "Tags added successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/tags", async (req, res) => {
      try {
        const tags = await tagsCollection.find().toArray();
        res.json(tags);
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.delete("/tags/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid tag ID" });
        const result = await tagsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Tag not found" });
        res.json({ message: "Tag deleted successfully" });
      } catch (error) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // ------------------ PAYMENT APIs ------------------
    app.post("/create-membership-intent", async (req, res) => {
      try {
        const { amountInCents, membershipType, userId } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({ amount: amountInCents, currency: "usd", metadata: { membershipType, userId } });
        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/membership-payments", async (req, res) => {
      try {
        const payment = req.body;
        const result = await paymentsCollection.insertOne(payment);
        const userUpdate = await usersCollection.updateOne({ uid: payment.userId }, { $set: { membership: true, badge: "gold" } });
        if (userUpdate.matchedCount === 0) return res.status(404).json({ success: false, message: "User not found, but payment recorded" });
        res.json({ success: true, insertedId: result.insertedId, message: "Payment recorded and user membership updated successfully" });
      } catch (err) {
        res.status(500).json({ success: false, message: "Server error", error: err.message });
      }
    });

    app.get("/stats/counts", async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const bronzeUsers = await usersCollection.countDocuments({ badge: "bronze" });
    const goldenUsers = await usersCollection.countDocuments({ badge: "gold" });
    const totalPosts = await postsCollection.countDocuments();

    res.json({
      totalUsers,
      bronzeUsers,
      goldenUsers,
      totalPosts,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


  } finally {
    // Do not close client in dev
  }
}

run().catch(console.dir);

// ------------------ HEALTH CHECK ------------------


app.listen(port, () => {
  console.log(`Forum-X app listening on port ${port}`);
});
