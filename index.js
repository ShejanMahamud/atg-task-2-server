const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion,ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 4549;
const mongoURI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

//app
const app = express();

//middlewares
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
  })
);
app.use(express.json());

//mongo client
const client = new MongoClient(mongoURI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const run = async () => {
  try {
    const usersCollection = client.db("banao-social").collection("users");
    const postsCollection = client.db("banao-social").collection("posts");

    // Middleware to verify JWT token
    const authenticateToken = (req, res, next) => {
      const token =
        req.headers.authorization && req.headers.authorization.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Access denied" });
      }
      jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ message: "Invalid token" });
        }
        req.user = user;
        next();
      });
    };

    //get all posts
    app.get('/posts',async(req,res)=>{
      const result = await postsCollection.find().toArray()
      res.send({success:true,posts:result})
    })

    // Register a user
    app.post("/register", async (req, res) => {
      const { name, username, email, password, gender, photo } = req.body;
      try {
        const user = await usersCollection.findOne({ username });
        if (user) {
          return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await usersCollection.insertOne({
          username,
          password: hashedPassword,
          email,
          gender,
          name,
          photo,
        });

        res
          .status(201)
          .json({ success: true, message: "User registered successfully" });
      } catch (error) {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Login a user
    app.post("/login", async (req, res) => {
      const { username, password } = req.body;
      try {
        const user = await usersCollection.findOne({ username });
        if (!user) {
          return res.send({ success: false, message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          return res.send({ success: false, message: "Invalid credentials" });
        }

        const { password: pass, ...rest } = user;
        const token = jwt.sign({ ...rest }, JWT_SECRET, { expiresIn: "1h" });
        res.send({ token, success: true, message: "Successfully Logged In"});
      } catch (error) {
        res.send({ message: "Internal server error" });
      }
    });

    //post a post to db
    app.post(`/posts`, async (req, res) => {
      try {
        const result = await postsCollection.insertOne(req.body);
        if (result.insertedId) {
          return res.send({
            success: true,
            message: "Post Submitted Successfully",
          });
        } else {
          return res.send({ success: false, message: "Post Submitted Failed" });
        }
      } catch (error) {
        res.status(400).send("Something Went Wrong!");
      }
    });

    //forget password api
    app.patch(
      "/forget_password/:email",
      authenticateToken,
      async (req, res) => {
        const { password } = req.body;
        const { email } = req.params;

        try {
          const hashedPassword = await bcrypt.hash(password, 10);
          const result = await usersCollection.updateOne(
            { email },
            { $set: { password: hashedPassword } }
          );

          if (result.modifiedCount > 0) {
            res.send({
              success: true,
              message: "Password Reset Successfully!",
            });
          } else {
            res.send({ success: false, message: "Password Reset Failed!" });
          }
        } catch (error) {
          console.error("Error resetting password:", error);
          res
            .status(500)
            .send({ success: false, message: "Internal server error" });
        }
      }
    );

    //update a post(like) 
    app.patch('/like/:id', authenticateToken, async (req, res) => {
      const userId = req.user._id; 
      const postId = req.params.id;
    
      try {
        const post = await postsCollection.findOne({ _id: new ObjectId(postId) });
        if (!post) {
          return res.status(404).json({ success: false, message: 'Post not found' });
        }
    
        const liked = post.likedBy.includes(userId);
        const update = liked 
      ? { $pull: { likedBy: userId }, $inc: { likes: -1 }, $set: { liked: false } }
      : { $addToSet: { likedBy: userId }, $inc: { likes: 1 }, $set: { liked: true } };
    
        const result = await postsCollection.updateOne(
          { _id: new ObjectId(postId) },
          update
        );
    
        if (result.modifiedCount > 0) {
          res.status(200).json({ success: true, message: 'Post updated successfully'});
        } else {
          res.status(400).json({ success: false, message: 'Failed to update post' });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: 'Internal Server Error' });
      }
    });

    //update a post(comment)
    app.patch('/comment/:id',async(req,res)=>{
      const {commentInfo} = req.body;
      const result = await postsCollection.updateOne({_id: new ObjectId(req.params.id)},{
        $push: {comments: {...commentInfo,_id: new ObjectId()}}
      })
      if(result.modifiedCount > 0){
        res.send({success: true, message: 'Comment Added!'})
      }else{
        res.send({success: false, message: 'Comment Failed!'})
      }
    })

    //update a entire post
    app.patch('/post/:id',authenticateToken,async(req,res)=>{
      const {newContent} = req.body
      const email = req.user;
      const result = await postsCollection.updateOne({_id: new ObjectId(req.params.id)},{
        $set: {
          content: newContent
        }
      })
      if(result.modifiedCount> 0) {
        res.send({success: true, message: 'Post Updated Successfully!'})
      }else{
        res.send({success: false, message: 'Post Updated Failed!'})
      }
    })
    
    //delete a post
    app.delete('/post/:id',async(req,res)=>{
      const result = await postsCollection.deleteOne({_id: new ObjectId(req.params.id)})
      if(result.deletedCount > 0){
        res.send({success: true,message: 'Successfully Deleted!'})
      }else{
        res.send({success: false,message: 'Something Wrong!'})
      }
    })

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensure client will close when you finish/error
  }
};
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send({ server_status: "Server Running" });
});

app.listen(port, () => {
  console.log("Server running on", port);
});
