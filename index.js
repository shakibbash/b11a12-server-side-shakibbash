// Existing imports
const dotenv = require('dotenv');
dotenv.config(); 
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.SECRET_KEY);
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
     const paymentsCollection = db.collection('payments');

    console.log("MongoDB connected");


    // Middleware: verifyAdmin
// const verifyAdmin = async (req, res, next) => {
//   try {

//     const email = req.user?.email;  
//     if (!email) {
//       return res.status(401).send({ message: "Unauthorized Access" });
//     }

//     // Check user in DB
//     const user = await usersCollection.findOne({ email });
//     if (!user || user.role !== "admin") {
//       return res.status(403).send({ message: "Forbidden Access" });
//     }

//     // If admin, continue
//     next();
//   } catch (error) {
//     console.error("verifyAdmin error:", error);
//     res.status(500).send({ message: "Server Error" });
//   }
// };

// ------------------ ADMIN APIs ------------------
// GET all users with optional search by username
app.get("/users", async (req, res) => {
  try {
    const search = req.query.search || ""; // ?search=john

    // Use regex for case-insensitive search
    const query = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    const users = await usersCollection.find(query).toArray();
    res.send(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ message: "Server Error" });
  }
});


app.get("/admin/stats", async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();
    const totalPosts = await postsCollection.countDocuments();
    const totalComments = await commentsCollection.countDocuments();

    res.json({
      totalUsers,
      totalPosts,
      totalComments,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Toggle user role (admin <-> user)
app.patch("/admin/users/:id/toggle-role", async (req, res) => {
  try {
    const { id } = req.params;

    const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: "User not found" });

    const newRole = user.role === "admin" ? "user" : "admin";

    await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: newRole } }
    );

    res.json({ message: `User role updated to ${newRole}`, role: newRole });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

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

// Update user by email
app.put("/users/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const updateData = req.body;

    const result = await usersCollection.updateOne(
      { email },
      { $set: updateData },
      { upsert: false } 
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
    // ------------------ POSTS APIs ------------------

   // Create post
app.post("/posts", async (req, res) => {
  try {
    const postData = req.body;

    // Check required fields
    if (!postData.authorEmail || !postData.title) {
      return res.status(400).json({ message: "authorEmail and title are required" });
    }

    // Find the user in the database
    const user = await usersCollection.findOne({ email: postData.authorEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Count the number of posts by this user
    const userPostsCount = await postsCollection.countDocuments({ authorEmail: postData.authorEmail });

    // Enforce post limit for non-members
    if (!user.membership && userPostsCount >= 5) {
      return res.status(403).json({ message: "Post limit reached. Become a member to post more." });
    }

    // Default votes and timestamp
    postData.upVote = 0;
    postData.downVote = 0;
    postData.createdAt = new Date();

    // Insert the post
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

    // ------------------ TAGS APIs ------------------
    // Create tags (predefined)
 app.post("/tags", async (req, res) => {
  try {
    const tags = req.body.tags; // expects array
    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ message: "Tags array is required" });
    }

    const newTags = tags.map((t) => ({ name: t }));

    // insert only non-duplicate names
    for (let tag of newTags) {
      const exists = await tagsCollection.findOne({ name: tag.name });
      if (exists) continue;
      await tagsCollection.insertOne(tag);
    }

    res.status(201).json({ message: "Tags added successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

    // Get tags
  app.get("/tags", async (req, res) => {
  try {
    const tags = await tagsCollection.find().toArray();
    res.json(tags); // returns array of objects { name: 'Technology' }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


app.delete("/tags/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid tag ID" });
    }

    const result = await tagsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Tag not found" });
    }

    res.json({ message: "Tag deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
                                         // comments api
// Get comments by postId
app.get("/comments", async (req, res) => {
  try {
    const { postId } = req.query;
    const comments = await commentsCollection.find({ postId }).sort({ createdAt: 1 }).toArray();
    res.json(comments); // frontend handles nesting using parentId
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// Count comments for a post


// Add comment
// Add comment or reply
app.post("/comments", async (req, res) => {
  try {
    const { postId, text, userEmail, userName, userPhoto, parentId = null } = req.body;
    if (!postId || !text || !userEmail) return res.status(400).json({ message: "Missing fields" });

    const newComment = {
      postId,
      parentId,
      text,
      userEmail,
      userName,
      userPhoto,
      upvotes: 0,
      downvotes: 0,
      reported: false,
      feedback: [],
      replies: [],
      createdAt: new Date(),
    };

    const result = await commentsCollection.insertOne(newComment);
    res.status(201).json({ message: "Comment added", commentId: result.insertedId });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// PATCH /comments/vote/:id
app.patch("/comments/vote/:id", async (req, res) => {
  const { id } = req.params;
  const { type, userEmail } = req.body; // 'upvote' or 'downvote'
  const comment = await commentsCollection.findOne({ _id: new ObjectId(id) });

  if (!comment) return res.status(404).send({ error: "Comment not found" });

  let upvoters = comment.upvoters || [];
  let downvoters = comment.downvoters || [];

  if (type === "upvote") {
    if (upvoters.includes(userEmail)) {
      // remove upvote (toggle)
      upvoters = upvoters.filter(u => u !== userEmail);
    } else {
      upvoters.push(userEmail);
      downvoters = downvoters.filter(u => u !== userEmail); // remove downvote
    }
  } else if (type === "downvote") {
    if (downvoters.includes(userEmail)) {
      // remove downvote (toggle)
      downvoters = downvoters.filter(u => u !== userEmail);
    } else {
      downvoters.push(userEmail);
      upvoters = upvoters.filter(u => u !== userEmail); // remove upvote
    }
  }

  const result = await commentsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { upvoters, downvoters, upvotes: upvoters.length, downvotes: downvoters.length } }
  );

  res.send(result);
});




app.patch("/comments/report/:id", async (req, res) => {
  try {
    await commentsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { reported: true } }
    );
    res.json({ message: "Comment reported" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete comment (only owner)
app.delete("/comments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail } = req.body; // frontend must send the email of logged-in user

    const comment = await db.collection("comments").findOne({ _id: new ObjectId(id) });
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (comment.userEmail !== userEmail) {
      return res.status(403).json({ message: "You can only delete your own comment" });
    }

    await db.collection("comments").deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Comment deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
// Edit comment (only owner)
app.patch("/comments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { text, userEmail } = req.body; // frontend must send logged-in user's email
    if (!text) return res.status(400).json({ message: "Text is required" });

    const comment = await commentsCollection.findOne({ _id: new ObjectId(id) });
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    if (comment.userEmail !== userEmail) {
      return res.status(403).json({ message: "You can only edit your own comment" });
    }

    await commentsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { text } }
    );

    res.json({ message: "Comment updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});
 
                                 //Payments related apis

// Create membership intent
app.post("/create-membership-intent", async (req, res) => {
  try {
    const { amountInCents, membershipType, userId } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      metadata: { membershipType, userId },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save membership payment and update user badge
app.post("/membership-payments", async (req, res) => {
  try {
    const payment = req.body;

    // 1️⃣ Insert payment into payments collection
    const result = await paymentsCollection.insertOne(payment);

    // 2️⃣ Update the corresponding user's membership and badge in users collection
    const userUpdate = await usersCollection.updateOne(
      { uid: payment.userId }, // match by UID
      { $set: { membership: true, badge: "gold" } }
    );

    if (userUpdate.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found, but payment recorded" 
      });
    }

    // 3️⃣ Return success
    res.json({ 
      success: true, 
      insertedId: result.insertedId, 
      message: "Payment recorded and user membership updated successfully" 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
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
