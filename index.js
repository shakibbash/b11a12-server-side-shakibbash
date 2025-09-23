// Existing imports
const dotenv = require('dotenv');
dotenv.config(); 
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oeuxqwy.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

async function run() {
  try {
    await client.connect();
    db = client.db('forumDB'); // global db

    const usersCollection = db.collection('users');
    const postsCollection = db.collection('posts');
    const tagsCollection = db.collection('tags');
    const commentsCollection = db.collection('comments');

    console.log("MongoDB connected");

    // ------------------ USERS APIs ------------------
    app.post("/users", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          await usersCollection.updateOne(
            { email },
            { $set: { last_login: new Date() } }
          );
          return res.status(200).json({ message: "User exists, last_login updated", updated: true });
        }

        const newUser = { ...req.body, createdAt: new Date(), last_login: new Date() };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({ message: "User created", userId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
      }
    });
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


    // ------------------ POSTS APIs ------------------
    // Create post
    app.post("/posts", async (req, res) => {
      try {
        const postData = req.body;
        if (!postData.authorEmail || !postData.title) {
          return res.status(400).json({ message: "authorEmail and title are required" });
        }

        // Count user posts
        const userPostsCount = await postsCollection.countDocuments({ authorEmail: postData.authorEmail });

        // Limit for normal users: 5 posts
        const user = await usersCollection.findOne({ email: postData.authorEmail });
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!user.membership && userPostsCount >= 5) {
          return res.status(403).json({ message: "Post limit reached. Become a member to post more." });
        }

        // Default votes
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




    // Get single post by ID
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
          let: { postId: { $toString: "$_id" } }, // convert _id to string
          pipeline: [
            { $match: { $expr: { $eq: ["$postId", "$$postId"] } } }, 
          ],
          as: "comments",
        },
      },
      {
        $addFields: {
          commentCount: { $size: "$comments" },
        },
      },
      {
        $project: { comments: 0 }, 
      },
      { $sort: { createdAt: -1 } }
    ]).toArray();

    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

      // Delete a post
    app.delete("/posts/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await postsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0)
          return res.status(404).json({ error: "Post not found" });
        res.json({ message: "Post deleted successfully" });
      } catch (err) {
        res.status(500).json({ error: "Invalid ID" });
      }
    });

app.patch("/posts/vote/:id", async (req, res) => {
  const { id } = req.params;
  const { type, userEmail } = req.body; // type = "upvote" | "downvote"

  if (!["upvote", "downvote"].includes(type)) {
    return res.status(400).json({ error: "Invalid vote type" });
  }

  if (!userEmail) {
    return res.status(400).json({ error: "User email is required" });
  }

  try {
    const post = await postsCollection.findOne({ _id: new ObjectId(id) });
    if (!post) return res.status(404).json({ error: "Post not found" });

    // Track votes by user
    const votes = post.votes || []; // Array of { userEmail, voteType }
    const existingVote = votes.find(v => v.userEmail === userEmail);

    let upVote = post.upVote || 0;
    let downVote = post.downVote || 0;
    let newVotes;

    if (!existingVote) {
      // First-time vote
      newVotes = [...votes, { userEmail, voteType: type }];
      if (type === "upvote") upVote++;
      else downVote++;
    } else if (existingVote.voteType === type) {
      // Remove existing vote
      newVotes = votes.filter(v => v.userEmail !== userEmail);
      if (type === "upvote") upVote--;
      else downVote--;
    } else {
      // Switch vote
      newVotes = votes.map(v => v.userEmail === userEmail ? { ...v, voteType: type } : v);
      if (type === "upvote") {
        upVote++;
        downVote--;
      } else {
        downVote++;
        upVote--;
      }
    }

    await postsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { upVote, downVote, votes: newVotes } }
    );

    res.json({ upVote, downVote });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

   


    console.log("APIs ready ✅");

  } finally {
    // Do not close client in dev
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Forum-X app listening on port ${port}`);
});
