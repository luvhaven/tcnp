# TCNP Journey Management - Deployment Guide

Complete guide for deploying the TCNP Journey Management application to Vercel with Supabase backend.

## Prerequisites

- GitHub account
- Vercel account (free tier)
- Supabase project set up (see GUIDE.txt)
- Domain name (optional)

## Step 1: Prepare Your Code

### 1.1 Push to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: TCNP Journey Management"

# Create GitHub repository and push
git remote add origin https://github.com/yourusername/tcnp-journey-management.git
git branch -M main
git push -u origin main
```

### 1.2 Verify Environment Variables

Ensure your `.env.local` file is complete but **DO NOT** commit it to GitHub. It's already in `.gitignore`.

## Step 2: Deploy to Vercel

### 2.1 Import Project

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Vercel will auto-detect Next.js

### 2.2 Configure Project

**Framework Preset:** Next.js (auto-detected)

**Root Directory:** `./` (leave as default)

**Build Command:** `npm run build` (default)

**Output Directory:** `.next` (default)

**Install Command:** `npm install` (default)

### 2.3 Add Environment Variables

Click "Environment Variables" and add these:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**Important:** 
- Get these from your Supabase project settings
- `NEXT_PUBLIC_APP_URL` will be your Vercel URL (you'll update this after first deployment)
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code

### 2.4 Deploy

1. Click "Deploy"
2. Wait 2-3 minutes for build to complete
3. You'll get a URL like: `https://tcnp-journey-management.vercel.app`

## Step 3: Post-Deployment Configuration

### 3.1 Update Environment Variables

1. In Vercel dashboard, go to your project
2. Settings → Environment Variables
3. Update `NEXT_PUBLIC_APP_URL` to your actual Vercel URL
4. Click "Save"
5. Redeploy: Deployments → Click "..." → "Redeploy"

### 3.2 Configure Supabase

1. In Supabase dashboard, go to Authentication → URL Configuration
2. Add your Vercel URL to:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/**`

### 3.3 Test the Deployment

1. Visit your Vercel URL
2. Try logging in with super admin credentials:
   - Email: `doriazowan@gmail.com`
   - Password: `&DannyDev1&`
3. Verify all features work:
   - Dashboard loads
   - Real-time updates work
   - Map displays correctly
   - Navigation works

## Step 4: Custom Domain (Optional)

### 4.1 Add Domain in Vercel

1. In Vercel project settings → Domains
2. Add your custom domain (e.g., `journey.tcnp.org`)
3. Follow DNS configuration instructions
4. Wait for DNS propagation (5-60 minutes)

### 4.2 Update Environment Variables

1. Update `NEXT_PUBLIC_APP_URL` to your custom domain
2. Redeploy

### 4.3 Update Supabase URLs

1. Add custom domain to Supabase redirect URLs
2. Update Site URL if needed

## Step 5: Configure Notification Providers (Optional)

### 5.1 Email Notifications (SMTP)

Add these environment variables in Vercel:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@tcnp.org
```

**For Gmail:**
1. Enable 2FA on your Google account
2. Generate an App Password
3. Use that as `SMTP_PASSWORD`

### 5.2 SMS Notifications (Twilio)

```env
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=your-twilio-phone
```

1. Sign up at [twilio.com](https://twilio.com)
2. Get free trial credits
3. Verify phone numbers for testing

### 5.3 Flight Tracking (OpenSky Network)

```env
OPENSKY_USERNAME=your-opensky-username
OPENSKY_PASSWORD=your-opensky-password
```

1. Register at [opensky-network.org](https://opensky-network.org)
2. Free tier available
3. Optional feature

## Step 6: Monitoring & Maintenance

### 6.1 Set Up Monitoring

**Vercel Analytics:**
1. Enable in Vercel dashboard
2. Free for hobby projects

**Supabase Monitoring:**
1. Check Database → Performance
2. Monitor API usage
3. Set up alerts for quota limits

### 6.2 Regular Maintenance

**Weekly:**
- Check error logs in Vercel
- Review Supabase logs
- Monitor database size

**Monthly:**
- Review and archive old audit logs
- Check storage usage
- Update dependencies

### 6.3 Backup Strategy

**Database Backups:**
1. Supabase Pro: Automatic daily backups
2. Free tier: Manual exports
3. Go to Database → Backups
4. Download SQL dump regularly

**Code Backups:**
- GitHub is your source of truth
- Tag releases: `git tag v1.0.0`
- Keep production branch protected

## Step 7: Scaling Considerations

### 7.1 Supabase Limits (Free Tier)

- 500MB database
- 1GB file storage
- 2GB bandwidth/month
- 50,000 monthly active users

**When to upgrade:**
- Database > 400MB
- Consistent high traffic
- Need more real-time connections

### 7.2 Vercel Limits (Hobby)

- 100GB bandwidth/month
- Unlimited deployments
- Serverless function execution: 100GB-hours

**When to upgrade:**
- High traffic (>100k visitors/month)
- Need team collaboration
- Custom domains (multiple)

## Step 8: Troubleshooting Deployment

### Build Errors

**"Module not found"**
```bash
# Locally test build
npm run build

# Check package.json dependencies
npm install
```

**"Type errors"**
```bash
# Run type check
npm run type-check

# Fix TypeScript errors before deploying
```

### Runtime Errors

**"Failed to fetch"**
- Check environment variables are set
- Verify Supabase URL is correct
- Check CORS settings in Supabase

**"Authentication failed"**
- Verify redirect URLs in Supabase
- Check Site URL matches deployment URL
- Clear browser cache and cookies

**"Real-time not working"**
- Check Supabase replication is enabled
- Verify WebSocket connections allowed
- Check browser console for errors

### Performance Issues

**Slow page loads:**
- Enable Vercel Analytics
- Check Supabase query performance
- Optimize images (use Next.js Image)
- Enable caching

**Database slow:**
- Check indexes are created
- Review slow queries in Supabase
- Consider upgrading Supabase plan

## Step 9: Security Checklist

- [ ] Environment variables set correctly
- [ ] Service role key not exposed in client code
- [ ] RLS policies enabled on all tables
- [ ] HTTPS enforced (automatic on Vercel)
- [ ] Supabase redirect URLs configured
- [ ] Strong passwords enforced
- [ ] Audit logging enabled
- [ ] Regular security updates

## Step 10: Going Live

### Pre-Launch Checklist

- [ ] All features tested in production
- [ ] Super admin account created
- [ ] Sample data seeded
- [ ] Protocol officers created
- [ ] Notification providers configured
- [ ] Mobile responsiveness verified
- [ ] PWA installation tested
- [ ] Real-time features working
- [ ] Map displaying correctly
- [ ] All call-signs functional
- [ ] Broken Arrow alerts working
- [ ] Audit logs recording
- [ ] Documentation complete

### Launch Day

1. **Announce to team:**
   - Share URL
   - Provide login credentials
   - Share user guide

2. **Monitor closely:**
   - Watch error logs
   - Check user feedback
   - Monitor performance

3. **Be ready to rollback:**
   - Keep previous deployment ready
   - Have backup plan

### Post-Launch

1. **Gather feedback:**
   - User experience
   - Feature requests
   - Bug reports

2. **Iterate:**
   - Fix critical bugs immediately
   - Plan feature updates
   - Improve based on usage

## Continuous Deployment

### Auto-Deploy from GitHub

Vercel automatically deploys when you push to `main`:

```bash
# Make changes
git add .
git commit -m "Feature: Add new dashboard widget"
git push origin main

# Vercel automatically deploys
```

### Preview Deployments

Every pull request gets a preview URL:
1. Create feature branch
2. Push changes
3. Open PR
4. Vercel creates preview
5. Test before merging

### Environment-Specific Deploys

**Production:** `main` branch
**Staging:** `staging` branch (optional)
**Development:** Local only

## Support Resources

- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)
- **Supabase Docs:** [supabase.com/docs](https://supabase.com/docs)
- **Next.js Docs:** [nextjs.org/docs](https://nextjs.org/docs)

## Emergency Procedures

### Site Down

1. Check Vercel status page
2. Check Supabase status
3. Review recent deployments
4. Rollback if needed

### Database Issues

1. Check Supabase dashboard
2. Review error logs
3. Check connection limits
4. Contact Supabase support

### Rollback Procedure

1. Go to Vercel → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"
4. Verify site is working

---

**Deployment Complete!** 🎉

Your TCNP Journey Management system is now live and ready to manage protocol operations efficiently.
