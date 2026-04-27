import { useListConsultingPackages, useListMyConsultingBookings, useCreateConsultingCheckout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Briefcase, Clock, Calendar, Check, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConsultingPage() {
  const { data: packages, isLoading: packagesLoading } = useListConsultingPackages();
  const { data: bookings, isLoading: bookingsLoading } = useListMyConsultingBookings();
  const checkout = useCreateConsultingCheckout();

  const handlePurchase = (packageKey: string) => {
    checkout.mutate(
      { data: { packageKey } },
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          }
        },
      }
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-5xl mx-auto w-full gap-8 overflow-y-auto">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-primary" />
          CONSULTING
        </h1>
        <p className="text-muted-foreground text-sm font-mono">
          Direct access to the principal engineer. Code review, architecture, unblocking.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2">RETAINER_PACKAGES</h2>
        
        {packagesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-full glass rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3">
            {packages?.data.map((pkg, index) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                key={pkg.key}
                className={`glass-interactive p-6 rounded-2xl flex flex-col relative ${
                  pkg.popular ? "glass-strong border-primary/50 ring-primary/30 shadow-[0_0_30px_rgba(255,102,0,0.15)] -translate-y-2" : ""
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full font-mono uppercase tracking-wider shadow-lg">
                    Recommended
                  </div>
                )}
                <div className="mb-4 relative z-10">
                  <h3 className="font-bold text-xl mb-2 font-mono text-foreground">{pkg.name}</h3>
                  <div className="flex items-baseline gap-1 font-mono mb-4">
                    <span className="text-3xl font-bold text-foreground">${pkg.priceUsd}</span>
                  </div>
                  <div className="flex items-center gap-2 text-primary font-mono text-sm glass-subtle px-3 py-1.5 rounded-md w-fit">
                    <Clock className="h-4 w-4" /> {pkg.hours} HOURS
                  </div>
                </div>
                
                <div className="flex-1 text-sm text-muted-foreground mb-6 relative z-10">
                  {pkg.description}
                </div>
                
                <Button 
                  onClick={() => handlePurchase(pkg.key)}
                  disabled={checkout.isPending}
                  variant={pkg.popular ? "default" : "secondary"}
                  className={pkg.popular ? "w-full font-mono font-bold shadow-lg shadow-primary/20 relative z-10" : "w-full font-mono font-bold glass-subtle hover:bg-muted/50 relative z-10"}
                >
                  {checkout.isPending && checkout.variables?.data.packageKey === pkg.key ? "..." : "BOOK_TIME"}
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono border-b border-border/20 pb-2 mt-4">ACTIVE_ENGAGEMENTS</h2>
        
        {bookingsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full glass rounded-xl" />
          </div>
        ) : !bookings || bookings.data.length === 0 ? (
          <div className="text-sm font-mono text-muted-foreground py-12 text-center glass-subtle rounded-xl border border-dashed flex flex-col items-center gap-2">
            <Shield className="h-6 w-6 opacity-50" />
            NO_ACTIVE_BOOKINGS
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {bookings.data.map((booking) => (
              <div key={booking.id} className="glass p-5 rounded-xl flex flex-col md:flex-row gap-4 md:items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-foreground">{booking.packageKey.toUpperCase()}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider glass-subtle ${
                      booking.status === 'active' ? 'text-primary ring-primary/30 border-0' : 
                      booking.status === 'completed' ? 'text-green-500 ring-green-500/30 border-0' : 
                      'text-muted-foreground border-border/20'
                    }`}>
                      {booking.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Booked {format(new Date(booking.createdAt), "MMM d, yyyy")}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-mono text-muted-foreground uppercase">Utilization</span>
                    <div className="font-mono font-bold text-foreground">
                      <span className="text-primary">{booking.hoursUsed}</span> / {booking.hoursTotal} <span className="text-muted-foreground text-xs">HRS</span>
                    </div>
                  </div>
                  
                  {booking.status === 'active' && (
                    <Button size="sm" className="font-mono glass-subtle text-foreground hover:bg-muted/50 border-0 shadow-none">
                      REQUEST_SESSION
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
