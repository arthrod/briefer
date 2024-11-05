import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

const config: Config = {
    darkMode: ['class'],
    content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  variants: {
    extend: {
      backgroundColor: ['focus'],
    },
  },
  theme: {
  	extend: {
  		transitionProperty: {
  			mw: 'max-width',
  			m: 'margin'
  		},
  		typography: {
  			DEFAULT: {
  				css: {
  					'code::before': {
  						content: '"'
  					},
  					'code::after': {
  						content: '"'
  					}
  				}
  			}
  		},
  		fontFamily: {
  			primary: ['Inter', ...fontFamily.sans],
  			young_serif: ['Young Serif"'],
  			syne: ['Syne"'],
  			trap: ['Trap"']
  		},
  		animation: {
  			flip: 'flip 6s infinite steps(2, end)',
  			rotate: 'rotate 3s linear infinite both',
  			'pulse-dark': 'pulse-dark 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			'heart-pulse': 'heart-pulse 2s ease-in-out infinite',
  			wiggle: 'wiggle 1s ease-in-out infinite'
  		},
  		keyframes: {
  			wiggle: {
  				'0%, 100%': {
  					transform: 'rotate(-12deg)'
  				},
  				'10%,50%': {
  					transform: 'rotate(-3deg)'
  				},
  				'25%': {
  					transform: 'rotate(-12deg)'
  				}
  			},
  			'heart-pulse': {
  				'0%, 100%': {
  					transform: 'scale(1)'
  				},
  				'10%, 30%': {
  					transform: 'scale(1.3)'
  				},
  				'20%, 40%': {
  					transform: 'scale(1.1)'
  				}
  			},
  			flip: {
  				to: {
  					transform: 'rotate(360deg)'
  				}
  			},
  			rotate: {
  				from: {
  					transform: 'rotate(0deg)'
  				},
  				to: {
  					transform: 'rotate(360deg)'
  				}
  			},
  			'pulse-dark': {
  				'0%, 100%': {
  					opacity: '1'
  				},
  				'50%': {
  					opacity: '.5'
  				}
  			}
  		},
  		backgroundImage: {
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  			'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))'
  		},
  		background: {
  			chat_linear: 'linear-gradient(0deg, rgba(47, 105, 254, 0.12), rgba(47, 105, 254, 0.12)), #FFFFFF'
  		},
  		colors: {
  			'dashboard-gray': '#fafbfd',
  			primary: {
  				'50': 'rgb(var(--tw-color-primary-50) / <alpha-value>)',
  				'100': 'rgb(var(--tw-color-primary-100) / <alpha-value>)',
  				'200': 'rgb(var(--tw-color-primary-200) / <alpha-value>)',
  				'300': 'rgb(var(--tw-color-primary-300) / <alpha-value>)',
  				'400': 'rgb(var(--tw-color-primary-400) / <alpha-value>)',
  				'500': 'rgb(var(--tw-color-primary-500) / <alpha-value>)',
  				'600': 'rgb(var(--tw-color-primary-600) / <alpha-value>)',
  				'700': 'rgb(var(--tw-color-primary-700) / <alpha-value>)',
  				'800': 'rgb(var(--tw-color-primary-800) / <alpha-value>)',
  				'900': 'rgb(var(--tw-color-primary-900) / <alpha-value>)',
  				'950': 'rgb(var(--tw-color-primary-950) / <alpha-value>)',
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			hunter: {
  				'50': 'rgb(var(--tw-color-hunter-green-50) / <alpha-value>)',
  				'100': 'rgb(var(--tw-color-hunter-green-100) / <alpha-value>)',
  				'200': 'rgb(var(--tw-color-hunter-green-200) / <alpha-value>)',
  				'300': 'rgb(var(--tw-color-hunter-green-300) / <alpha-value>)',
  				'400': 'rgb(var(--tw-color-hunter-green-400) / <alpha-value>)',
  				'500': 'rgb(var(--tw-color-hunter-green-500) / <alpha-value>)',
  				'600': 'rgb(var(--tw-color-hunter-green-600) / <alpha-value>)',
  				'700': 'rgb(var(--tw-color-hunter-green-700) / <alpha-value>)',
  				'800': 'rgb(var(--tw-color-hunter-green-800) / <alpha-value>)',
  				'900': 'rgb(var(--tw-color-hunter-green-900) / <alpha-value>)',
  				'950': 'rgb(var(--tw-color-hunter-green-950) / <alpha-value>)'
  			},
  			selago: {
  				'50': 'rgb(var(--tw-color-selago-50) / <alpha-value>)',
  				'100': 'rgb(var(--tw-color-selago-100) / <alpha-value>)',
  				'200': 'rgb(var(--tw-color-selago-200) / <alpha-value>)',
  				'300': 'rgb(var(--tw-color-selago-300) / <alpha-value>)',
  				'400': 'rgb(var(--tw-color-selago-400) / <alpha-value>)',
  				'500': 'rgb(var(--tw-color-selago-500) / <alpha-value>)',
  				'600': 'rgb(var(--tw-color-selago-600) / <alpha-value>)',
  				'700': 'rgb(var(--tw-color-selago-700) / <alpha-value>)',
  				'800': 'rgb(var(--tw-color-selago-800) / <alpha-value>)',
  				'900': 'rgb(var(--tw-color-selago-900) / <alpha-value>)',
  				'950': 'rgb(var(--tw-color-selago-950) / <alpha-value>)'
  			},
  			ceramic: {
  				'50': 'rgb(var(--tw-color-ceramic-50) / <alpha-value>)',
  				'100': 'rgb(var(--tw-color-ceramic-100) / <alpha-value>)',
  				'200': 'rgb(var(--tw-color-ceramic-200) / <alpha-value>)',
  				'300': 'rgb(var(--tw-color-ceramic-300) / <alpha-value>)',
  				'400': 'rgb(var(--tw-color-ceramic-400) / <alpha-value>)',
  				'500': 'rgb(var(--tw-color-ceramic-500) / <alpha-value>)',
  				'600': 'rgb(var(--tw-color-ceramic-600) / <alpha-value>)',
  				'700': 'rgb(var(--tw-color-ceramic-700) / <alpha-value>)',
  				'800': 'rgb(var(--tw-color-ceramic-800) / <alpha-value>)',
  				'900': 'rgb(var(--tw-color-ceramic-900) / <alpha-value>)',
  				'950': 'rgb(var(--tw-color-ceramic-950) / <alpha-value>)'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography'), require("tailwindcss-animate")],
}
export default config
