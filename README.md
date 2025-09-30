# Forum-X Backend (Server API)

**Live Server:** [https://forum-x-server.vercel.app](https://forum-x-server.vercel.app)  

---

## Project Overview
This is the **backend API** for Forum-X, a MERN stack forum platform. Built with **Node.js, Express, and MongoDB**, it handles:

- User authentication & role-based access (via Firebase & JWT)  
- Post creation, editing, deletion, and voting  
- Comments & replies management  
- Reports & moderation system  
- Notifications & announcements  
- Membership payments with Stripe  
- Tag management & post filtering  

This backend powers the React frontend and provides REST APIs for all features.

---

## Technologies Used

### Backend
- **Node.js**  
- **Express.js** (v5.1.0)  
- **MongoDB** / **Mongoose** (v6.20.0 / v8.18.1)  
- **Firebase Admin SDK** (v13.5.0)  
- **Stripe** (v18.5.0)  
- **dotenv** (v17.2.2)  
- **CORS** (v2.8.5)  

### Features Covered
- Authentication & Authorization (Firebase token verification, Admin middleware)  
- User management & profile updates  
- Posts CRUD with pagination, search, and voting  
- Comments & nested replies with reporting and voting  
- Notifications (read/unread/clear)  
- Announcements CRUD  
- Tags CRUD & search  
- Stripe membership payments  
- Stats & analytics (user/post/comment counts, badge distribution)  

---

## Installation & Setup

### Clone the repository
```bash
git clone https://github.com/YourUsername/forum-x-server.git
cd forum-x-server
```

### Install dependencies
```bash
npm install
```

### Environment Variables
Create a `.env` file with:

```env
PORT=3000
DB_USER=yourMongoDBUsername
DB_PASS=yourMongoDBPassword
SECRET_KEY=yourStripeSecretKey
FB_SERVICE_KEY=yourFirebaseServiceAccountBase64
```

- `FB_SERVICE_KEY` is **base64-encoded JSON** of your Firebase service account.  
- `SECRET_KEY` is your **Stripe secret key**.

### Run the server
```bash
npm run start
```
Server will start at `http://localhost:3000`.

---

## API Routes Overview

### Health Check
* `GET /` → Returns "Hello World!"

### Users
* `POST /users` → Create or update a user
* `GET /users/:email` → Get user by email
* `PUT /users/:email` → Update user profile (token required)
* `GET /users` → Admin: list users (optional search)
* `PATCH /admin/users/:id/toggle-role` → Admin: toggle role

### Posts
* `POST /posts` → Create post (token required)
* `GET /posts` → Get all posts
* `GET /posts/:id` → Get single post
* `GET /posts/details/:id` → Post details with comments
* `GET /user-posts/:email` → Posts by a user
* `PATCH /posts/vote/:id` → Upvote/downvote post (token required)
* `DELETE /posts/:id` → Delete post (token required)
* `GET /posts/by-tag/:tagName` → Search posts by tag
* `GET /posts/popular` → Get popular posts
* `GET /posts/page/:page` → Pagination

### Comments
* `GET /comments?postId=...` → Get comments for a post
* `POST /comments` → Add comment/reply (token required)
* `PATCH /comments/:id` → Edit comment (token required)
* `PATCH /comments/vote/:id` → Upvote/downvote comment (token required)
* `PATCH /comments/report/:id` → Report comment (token required)
* `DELETE /comments/:id` → Delete comment (token required)

### Notifications
* `GET /notifications/:userEmail` → Get notifications (token required)
* `PATCH /notifications/:id/read` → Mark as read (token required)
* `PATCH /notifications/:email/read-all` → Mark all read (token required)
* `DELETE /notifications/:email/clear-all` → Clear all notifications (token required)

### Announcements
* `POST /announcements` → Create announcement
* `GET /announcements` → Get all announcements
* `GET /announcements/count` → Count announcements
* `PATCH /announcements/:id` → Update announcement
* `DELETE /announcements/:id` → Delete announcement

### Tags
* `POST /tags` → Add tags
* `GET /tags` → Get all tags
* `GET /tags/search?q=...` → Search tags
* `GET /tags/with-counts` → Tags with post counts
* `DELETE /tags/:id` → Delete tag

### Payments
* `POST /create-membership-intent` → Create Stripe payment intent
* `POST /membership-payments` → Record payment and update membership

### Stats
* `GET /stats/counts` → Users, badges, posts counts

---

## GitHub Repository
[https://github.com/YourUsername/forum-x-server](https://github.com/YourUsername/forum-x-server)
