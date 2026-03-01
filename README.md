# QuickHire — Backend

The REST API for QuickHire, built with **Express 5** and **MongoDB** (native driver). Handles jobs, applications, users, and admin operations.

🔗 **Live Frontend:** https://quick-hire-sage.vercel.app/
📁 **Frontend Repo:** https://github.com/TusharChow20/quire-hire-client

---

## Tech Stack

| Tool | Version |
|---|---|
| Node.js | 20.19.0+ |
| Express | 5.2.1 |
| MongoDB Driver | 7.1.0 |
| bcryptjs | 3.0.3 |
| dotenv | 17 |
| cors | 2.8.6 |

---

## Getting Started

### Prerequisites

- Node.js **20.19.0+**
- A MongoDB Atlas cluster or local MongoDB instance

### Installation

```bash
git clone https://github.com/TusharChow20/quick-hire-server.git
cd quick-hire-server
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```dotenv
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/QuickHire
PORT=5000
```

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `PORT` | Port the server listens on (default: `5000`) |

### Run Locally

```bash
node index.js
```

Server runs at **http://localhost:5000**

---

## API Reference

### Health Check

```
GET /
```

---

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and get user data |

**Register body:**
```json
{ "name": "Jane", "email": "jane@example.com", "password": "secret123" }
```

**Login body:**
```json
{ "email": "jane@example.com", "password": "secret123" }
```

---

### Jobs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/jobs` | List all jobs (paginated, filterable) |
| `GET` | `/api/jobs/featured` | Get featured jobs |
| `GET` | `/api/jobs/latest` | Get latest jobs |
| `GET` | `/api/jobs/categories` | Get job count per category |
| `GET` | `/api/jobs/:id` | Get single job details |
| `POST` | `/api/jobs` | Create a job |
| `PATCH` | `/api/jobs/:id/featured` | Toggle featured status |
| `DELETE` | `/api/jobs/:id` | Delete a job (cascades to applications) |

**GET /api/jobs query params:**

| Param | Example | Description |
|---|---|---|
| `search` | `react` | Search title, company, description |
| `category` | `Engineering` | Filter by category |
| `type` | `Full Time` | Filter by job type |
| `location` | `Remote` | Filter by location |
| `salary_min` | `50000` | Minimum salary |
| `salary_max` | `120000` | Maximum salary |
| `sortBy` | `oldest` / `title_asc` | Sort order (default: newest) |
| `page` | `1` | Page number |
| `limit` | `12` | Results per page |

---

### Applications

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/applications` | Submit a job application |
| `GET` | `/api/applications?role=admin` | Get all applications (admin only) |
| `GET` | `/api/applications/my?email=` | Get applications for a user |
| `PATCH` | `/api/applications/:id/status?role=admin` | Update application status |

**Application status values:** `pending` · `reviewed` · `shortlisted` · `rejected` · `hired`

---

### Admin Stats

```
GET /api/admin/stats?role=admin
```

Returns: total jobs, total applications, total companies, new today counts, applications by status, top 5 categories.

---

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users/:id` | Get user profile (password excluded) |
| `PATCH` | `/api/users/:id` | Update name or change password |

---

## Database

MongoDB database name: **`QuickHire`**

### Collections

**`jobs`**
```
title, company, location, category, type, description,
requirements[], tags[], logo, salary_min, salary_max,
salary_currency, isFeatured, views, applicationCount, created_at, updated_at
```

**`applications`**
```
job_id, job_title, company, name, email, phone,
resume_link, cover_note, linkedin_url, portfolio_url,
status, created_at, updated_at
```

**`users`**
```
name, email, password (bcrypt hashed), role (user|admin),
avatar, created_at, updated_at
```

---

## Admin Access

Admin routes are protected by a `requireAdmin` middleware that checks `role === "admin"` from the request query or body. To create an admin user, manually set `"role": "admin"` on a user document in MongoDB Atlas.

---

## Validation

All endpoints validate required fields and return structured errors:

```json
{
  "success": false,
  "errors": ["title is required", "email is required"]
}
```

Duplicate application detection: same `email` + `job_id` combination is rejected with a `409` response.

---

## Deployment

Recommended: **Railway** or **Render**

Set these environment variables in your hosting dashboard:

```
MONGO_URI=mongodb+srv://...
PORT=5000
```

---

## Links

- 🌐 Live: https://quick-hire-sage.vercel.app/
- 🖥️ Backend Repo: https://github.com/TusharChow20/quick-hire-server
- 💻 Frontend Repo: https://github.com/TusharChow20/quire-hire-client