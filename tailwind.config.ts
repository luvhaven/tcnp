import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  // Compiles every `hover:` utility inside @media (hover: hover). Without it a
  // tap on touch leaves the hover state stuck until you tap somewhere else —
  // which reads as "this row is selected" on a table the user only scrolled past.
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // lib/ holds shared class maps (e.g. the call-sign severity palette in
    // lib/constants/call-signs.ts). Without this glob those classes are never
    // seen by the scanner and get purged out of the build — the styles simply
    // vanish in production while looking fine in dev.
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
	theme: {
		extend: {
			screens: {
				// Sidebar push-layout / drawer split (~tablet portrait+)
				nav: '860px',
			},
			colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))',
  				// The legible cut of the brand orange — use as a FILL behind white
  				// text (bg-primary-text), where the vivid --primary only reaches
  				// 2.94:1. Orange *text* is handled by the .text-primary override
  				// in globals.css, so call sites don't need to change.
  				text: 'hsl(var(--primary-text))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning))',
  				foreground: 'hsl(var(--warning-foreground))'
  			},
  			info: {
  				DEFAULT: 'hsl(var(--info))',
  				foreground: 'hsl(var(--info-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		/* Radius steps come from the token scale so nested surfaces can be made
  		   concentric: an inner control inside a `rounded-lg` card with p-4 wants
  		   the next step down, not a radius picked by eye. */
  		borderRadius: {
  			sm: 'var(--radius-sm)',
  			md: 'var(--radius-md)',
  			lg: 'var(--radius-lg)',
  			xl: 'var(--radius-xl)',
  			'2xl': 'var(--radius-2xl)',
  			full: 'var(--radius-full)'
  		},
  		/* One easing and four durations, named by what they're for. Everything
  		   in the app transitions with these rather than a fresh cubic-bezier. */
  		transitionTimingFunction: {
  			out: 'var(--ease-out)',
  			// Slight overshoot — used for toggles/thumbs so they land with a
  			// little physicality. Named here rather than written inline as an
  			// arbitrary value, because commas inside ease-[...] make Tailwind
  			// treat the class as ambiguous and emit a build warning.
  			spring: 'var(--ease-spring)'
  		},
  		transitionDuration: {
  			instant: 'var(--duration-instant)',
  			fast: 'var(--duration-fast)',
  			base: 'var(--duration-base)',
  			slow: 'var(--duration-slow)'
  		},
  		/* Type scale, named by role rather than by size. Each step carries its own
  		   line-height and tracking, so a heading can't be set to 24px without also
  		   getting the 1.15 leading and the negative tracking that size needs.
  		   Roles: display/title for headings, body for prose, label for controls,
  		   caption for secondary text. Tailwind's text-xs..text-2xl still work. */
  		fontSize: {
  			'display': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '600' }],
  			'title-lg': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
  			'title': ['1.25rem', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '600' }],
  			'title-sm': ['1.0625rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
  			'body-lg': ['1rem', { lineHeight: '1.6' }],
  			'body': ['0.875rem', { lineHeight: '1.55' }],
  			'label': ['0.875rem', { lineHeight: '1.3', fontWeight: '500' }],
  			'caption': ['0.8125rem', { lineHeight: '1.45' }],
  			'overline': ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.06em', fontWeight: '600' }]
  		},
  		/* Caps the measure on long-form text at ~65 characters */
  		maxWidth: {
  			prose: '65ch'
  		},
  		boxShadow: {
  			xs: 'var(--shadow-xs)',
  			elevation: 'var(--shadow-sm)',
  			'elevation-md': 'var(--shadow-md)',
  			'elevation-lg': 'var(--shadow-lg)',
  			'elevation-xl': 'var(--shadow-xl)',
  			glow: 'var(--shadow-glow-primary)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
};
export default config;
