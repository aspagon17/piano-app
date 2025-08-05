"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"
import { IconCircleCheck, IconInfoCircle } from "@tabler/icons-react"
import React from "react"
import { useIsMobile } from "../../hooks/use-mobile"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const isMobile = useIsMobile()

  const toasterContent = (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group z-[99999] pointer-events-auto text-center justify-center"
      icons={{
        success: <IconCircleCheck className="w-4 h-4" />,
        error: <IconInfoCircle className="w-4 h-4" />,
        warning: <IconInfoCircle className="w-4 h-4" />,
        info: <IconInfoCircle className="w-4 h-4" />,
        
      }}
      toastOptions={{
        
        classNames: {
          toast:
            " group toast group-[.toaster]:bg-popover group-[.toaster]:rounded-2xl group-[.toaster]:text-popover-foreground group-[.toaster]:border-popover-border group-[.toaster]:border group-[.toaster]:shadow-sm",
          title: "group-[.toast]:text-foreground",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
        

      }}
      {...props}
    position={isMobile ? 'top-center' : 'top-center'}

 
    />
  )
  // Only render in the browser
  //if (typeof window === 'undefined') return null;

  //return createPortal(toasterContent, document.body);
  return toasterContent
}

export { Toaster }
