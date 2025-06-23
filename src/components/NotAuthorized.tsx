"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ShieldAlert, ArrowLeft, Lock, Crown, Users } from "lucide-react"
import { useI18n } from "@/locales/i18n"

interface NotAuthorizedProps {
  onGoBack: () => void
  requiredRole?: "ADMIN" | "RENTAL"
  title?: string
  message?: string
}

export default function NotAuthorized({ 
  onGoBack, 
  requiredRole = "ADMIN",
  title,
  message 
}: NotAuthorizedProps) {
  const { t } = useI18n()
  const [animationPhase, setAnimationPhase] = useState(0)
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([])

  // Cool animation effect with particles
  useEffect(() => {
    const timer1 = setTimeout(() => setAnimationPhase(1), 100)
    const timer2 = setTimeout(() => setAnimationPhase(2), 400)
    const timer3 = setTimeout(() => setAnimationPhase(3), 700)
    const timer4 = setTimeout(() => setAnimationPhase(4), 1000)
    
    // Generate floating particles
    const newParticles = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * 400,
      y: Math.random() * 300,
      delay: Math.random() * 2000
    }))
    setParticles(newParticles)
    
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
      clearTimeout(timer4)
    }
  }, [])

  const defaultTitle = requiredRole === "ADMIN" 
    ? t("notAuthorized.adminTitle", { defaultValue: "Admin Access Required" })
    : t("notAuthorized.rentalTitle", { defaultValue: "Rental Team Access Required" })

  const defaultMessage = requiredRole === "ADMIN"
    ? t("notAuthorized.adminMessage", { 
        defaultValue: "You need administrator privileges to access this section." 
      })
    : t("notAuthorized.rentalMessage", { 
        defaultValue: "You need to be part of the rental team to access this section." 
      })

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className={`absolute w-2 h-2 bg-gradient-to-r from-red-400/20 to-orange-400/20 rounded-full transition-all duration-[3000ms] ease-in-out ${
              animationPhase >= 2 ? 'animate-pulse' : 'opacity-0'
            }`}
            style={{
              left: `${particle.x}px`,
              top: `${particle.y}px`,
              animationDelay: `${particle.delay}ms`,
              transform: animationPhase >= 2 ? 'translateY(-20px)' : 'translateY(0px)'
            }}
          />
        ))}
      </div>

      {/* Glowing background effect */}
      <div 
        className={`absolute inset-0 transition-all duration-2000 ${
          animationPhase >= 1 
            ? 'bg-gradient-to-br from-red-50/30 via-transparent to-orange-50/30 dark:from-red-950/20 dark:via-transparent dark:to-orange-950/20' 
            : 'bg-transparent'
        }`}
      />

      <Card 
        className={`w-full max-w-lg relative z-10 backdrop-blur-sm transition-all duration-1000 border-2 ${
          animationPhase >= 1 
            ? 'opacity-100 translate-y-0 border-red-200 dark:border-red-800 shadow-2xl shadow-red-500/10' 
            : 'opacity-0 translate-y-12 border-transparent'
        }`}
      >
        <CardContent className="p-10 text-center space-y-8">
          {/* Main Icon with pulse effect */}
          <div className="relative">
            {/* Pulsing rings */}
            <div 
              className={`absolute inset-0 transition-all duration-1000 ${
                animationPhase >= 2 ? 'scale-150 opacity-30' : 'scale-100 opacity-0'
              }`}
            >
              <div className="w-24 h-24 mx-auto rounded-full border-4 border-red-400 animate-ping" />
            </div>
            <div 
              className={`absolute inset-0 transition-all duration-1000 delay-200 ${
                animationPhase >= 2 ? 'scale-125 opacity-50' : 'scale-100 opacity-0'
              }`}
            >
              <div className="w-24 h-24 mx-auto rounded-full border-2 border-orange-400 animate-ping" />
            </div>
            
            {/* Main icon container */}
            <div 
              className={`relative w-24 h-24 mx-auto rounded-full transition-all duration-700 flex items-center justify-center ${
                animationPhase >= 1 ? 'scale-100 rotate-0' : 'scale-0 rotate-180'
              } ${
                animationPhase >= 2 
                  ? 'bg-gradient-to-br from-red-500 to-orange-600 shadow-lg shadow-red-500/30' 
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <ShieldAlert 
                className={`h-12 w-12 transition-colors duration-500 ${
                  animationPhase >= 2 ? 'text-white' : 'text-gray-500'
                }`} 
              />
            </div>
            
            {/* Floating role icons */}
            <div 
              className={`absolute -top-3 -right-3 transition-all duration-700 delay-500 ${
                animationPhase >= 3 ? 'opacity-100 translate-x-0 rotate-12' : 'opacity-0 translate-x-6'
              }`}
            >
              {requiredRole === "ADMIN" ? (
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                  <Crown className="h-4 w-4 text-white" />
                </div>
              ) : (
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                  <Users className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
            
            <div 
              className={`absolute -bottom-3 -left-3 transition-all duration-700 delay-700 ${
                animationPhase >= 3 ? 'opacity-100 translate-x-0 -rotate-12' : 'opacity-0 -translate-x-6'
              }`}
            >
              <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center shadow-lg">
                <Lock className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>

          {/* Content with typewriter effect */}
          <div 
            className={`space-y-4 transition-all duration-700 delay-300 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <h1 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
              {title || defaultTitle}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {message || defaultMessage}
            </p>
          </div>

          {/* Animated role badge */}
          <div 
            className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold transition-all duration-700 delay-600 border-2 ${
              animationPhase >= 3 ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
            } ${
              requiredRole === "ADMIN" 
                ? 'bg-gradient-to-r from-purple-100 to-purple-200 text-purple-800 border-purple-300 dark:from-purple-900/30 dark:to-purple-800/30 dark:text-purple-300 dark:border-purple-600'
                : 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300 dark:from-blue-900/30 dark:to-blue-800/30 dark:text-blue-300 dark:border-blue-600'
            }`}
          >
            {requiredRole === "ADMIN" ? (
              <Crown className="h-4 w-4 mr-2" />
            ) : (
              <Users className="h-4 w-4 mr-2" />
            )}
            {requiredRole === "ADMIN" 
              ? t("roles.admin", { defaultValue: "Administrator" })
              : t("roles.rental", { defaultValue: "Rental Team" })
            }
          </div>

          {/* Action button */}
          <div 
            className={`pt-6 transition-all duration-700 delay-800 ${
              animationPhase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
            }`}
          >
            <Button 
              onClick={onGoBack} 
              variant="outline" 
              className="w-full group hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <ArrowLeft className="h-4 w-4 mr-2 transition-transform group-hover:-translate-x-1" />
              {t("common.back", { defaultValue: "Go Back" })}
            </Button>
          </div>

          {/* Help text */}
          <p 
            className={`text-sm text-muted-foreground transition-all duration-700 delay-900 ${
              animationPhase >= 4 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {t("notAuthorized.contactAdmin", { 
              defaultValue: "Need help? Contact an administrator." 
            })}
          </p>

          {/* Status indicator */}
          <div 
            className={`flex items-center justify-center gap-2 text-xs text-muted-foreground/70 transition-all duration-700 delay-1000 ${
              animationPhase >= 4 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Access Denied - Insufficient Permissions
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
