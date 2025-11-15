# TCNP Journey Management

Enterprise-grade Journey Management PWA for The Covenant Nation Protocol - Real-time tracking, call-sign workflow, and comprehensive protocol officer management.

## 🚀 Features

- **Role-Based Access Control (RBAC)** - 13 distinct roles with granular permissions
- **Real-time Journey Tracking** - Live vehicle positions and status updates
- **Call-Sign Workflow** - First Course, Chapman, Dessert, Cocktail, Broken Arrow, etc.
- **Interactive Map** - Real-time vehicle tracking with Leaflet/OpenStreetMap
- **Papa Management** - Complete guest profile management with flight details
- **Fleet Management** - Vehicle (Cheetah) tracking and assignment
- **Protocol Officers** - Online/offline status, role management
- **Eagle Square Management** - Airport and flight tracking
- **Nest & Theatre Management** - Hotel and venue coordination
- **Incident Reporting** - Real-time incident management and escalation
- **Audit Logging** - Complete action history and compliance tracking
- **Notification System** - Email, SMS, Push notifications
- **Dark/Light Theme** - Beautiful, modern UI with theme support
- **PWA Support** - Install as native app on any device
- **Mobile Responsive** - Optimized for all screen sizes

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (free tier works)
- Vercel account (for deployment)

## 🛠️ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the database schema:
   - Go to SQL Editor in Supabase dashboard
   - Copy and run `docs/DATABASE_SCHEMA.sql`
3. Run the seed data:
   - Copy and run `docs/SEED_DATA.sql`
4. Enable Real-time:
   - Go to Database > Replication
   - Enable real-time for: journeys, journey_events, cheetahs, telemetry_data, users, notifications
5. Create storage buckets:
   - avatars (public)
   - documents (private)
   - logos (public)

### 3. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Create Super Admin User

1. In Supabase dashboard, go to Authentication > Users
2. Click "Add User"
3. Email: `doriazowan@gmail.com`
4. Password: `&DannyDev1&`
5. Click "Create User"

The user profile will be automatically created via database triggers.

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and login with the super admin credentials.

## 📚 Documentation

- **[GUIDE.txt](./GUIDE.txt)** - Complete setup guide
- **[docs/DATABASE_SCHEMA.sql](./docs/DATABASE_SCHEMA.sql)** - Full database schema
- **[docs/SEED_DATA.sql](./docs/SEED_DATA.sql)** - Sample data
- **[docs/SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md)** - Detailed Supabase configuration

## 🏗️ Project Structure

```
tcnp-journey-management/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   │   └── login/
│   ├── (dashboard)/       # Dashboard pages
│   │   ├── dashboard/
│   │   ├── journeys/
│   │   ├── papas/
│   │   ├── fleet/
│   │   ├── protocol-officers/
│   │   ├── eagle-squares/
│   │   ├── nests/
│   │   ├── theatres/
│   │   ├── incidents/
│   │   ├── audit-logs/
│   │   └── settings/
│   ├── api/               # API routes
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── dashboard/        # Dashboard components
│   └── maps/             # Map components
├── lib/                   # Utilities
│   ├── supabase/         # Supabase clients
│   ├── hooks/            # Custom hooks
│   └── utils.ts          # Helper functions
├── types/                 # TypeScript types
├── docs/                  # Documentation
└── public/               # Static assets
```

## 👥 User Roles & Permissions

### Administrative Roles
- **Super Admin** - Full system access, cannot be deactivated
- **Admin** - High-level access, manage users and entities
- **Captain / Head of Operation** - Oversee operations, manage protocol officers
- **Head of Command Center** - Monitor all operations, real-time tracking

### Operational Roles
- **Delta Oscar (DO)** - Manage assigned Papa journeys, execute call-signs
- **Tango Oscar (TO) / Head TO** - Manage fleet, vehicle assignments
- **Alpha Oscar (AO)** - Manage airports, flight tracking
- **November Oscar (NO)** - Manage hotels, room assignments
- **Victor Oscar (VO)** - Manage venues, gate confirmations

### Limited Access
- **Viewer** - Read-only access
- **Media** - View arrival times only
- **External** - Restricted partner access

## 🎯 Call-Sign Workflow

The system is built around Standard Operating Procedure (SOP) call-signs:

- **First Course** - Departure from Nest to Theatre
- **Chapman** - Arrival at Theatre gate
- **Dessert** - Departure from Theatre to Nest
- **Cocktail** - Principal in-transit
- **Blue Cocktail** - Mild traffic (status indicator)
- **Red Cocktail** - Heavy traffic (status indicator)
- **Re-order** - Route change required
- **Broken Arrow** - Emergency/Distress (triggers immediate alerts)

Only assigned Delta Oscars can execute call-sign actions. All actions are logged with timestamp and user information.

## 🔐 Security Features

- Row Level Security (RLS) on all tables
- Role-based access control (RBAC)
- Audit logging for all critical actions
- Secure authentication with JWT
- Environment variable protection
- Input validation and sanitization

## 🚀 Deployment

### Deploy to Vercel

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

```bash
# Or use Vercel CLI
vercel
```

### Post-Deployment

1. Update `NEXT_PUBLIC_APP_URL` in environment variables
2. Configure custom domain (optional)
3. Set up monitoring and alerts
4. Configure notification providers (SMTP, Twilio)

## 🧪 Testing

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Build for production
npm run build
```

## 📱 PWA Features

- Installable on all devices
- Offline support
- Push notifications
- App-like experience
- Auto-updates

## 🎨 Customization

### Branding
- Upload logo in Settings > Branding
- Update favicon
- Customize theme colors in `tailwind.config.ts`

### Notifications
- Configure SMTP for email notifications
- Add Twilio credentials for SMS
- Set up Web Push for browser notifications

## 🐛 Troubleshooting

### Common Issues

**"Failed to connect to Supabase"**
- Check `.env.local` file exists and has correct values
- Verify Supabase project is active
- Check network connection

**"Authentication error"**
- Ensure user exists in Supabase Auth
- Check RLS policies are enabled
- Clear browser cache

**"Real-time not working"**
- Enable replication in Supabase dashboard
- Check table permissions
- Verify network allows WebSocket connections

**"Map not loading"**
- Check browser console for errors
- Verify Leaflet CSS is loaded
- Ensure location data exists

## 📞 Support

For issues or questions:
1. Check [GUIDE.txt](./GUIDE.txt) for detailed setup instructions
2. Review [docs/](./docs/) folder for technical documentation
3. Check Supabase logs for backend errors
4. Review browser console for frontend errors

## 📄 License

Proprietary - The Covenant Nation Protocol

## 🙏 Acknowledgments

Built with:
- Next.js 15
- Supabase
- TypeScript
- Tailwind CSS
- Leaflet
- shadcn/ui

---

**Version:** 1.0.0  
**Last Updated:** November 2025  
**Maintained by:** BIGWEB Digital
