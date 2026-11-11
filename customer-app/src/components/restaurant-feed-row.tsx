import { RestaurantHeroCard } from "@/src/components/restaurant-hero-card";
import type { RestaurantAvailability } from "@/src/types/restaurant";

type Props = {
  name: string;
  subtitle?: string;
  imageUrl?: string | null;
  isOpen?: boolean;
  availability?: RestaurantAvailability | null;
  offerLabel?: string | null;
  distanceKm?: number | null;
  avgRating?: number | null;
  reviewCount?: number;
  preparationTimeMinutes?: number | null;
  deliveryFee?: number | null;
  isFavorite?: boolean;
  favoriteDisabled?: boolean;
  customBadge?: string | null;
  onToggleFavorite?: () => void;
  onPress?: () => void;
};

// "All restaurants" / Favourites / Search card — one per row. Same RestaurantHeroCard as
// the Featured rail ("list" variant): short ambient-photo banner (whole photo, never
// cropped) + name/rating, cuisine · distance, time · delivery fee underneath.
// (RestaurantHeroCard is memoized on its data props already.)
export function RestaurantFeedRow(props: Props) {
  return <RestaurantHeroCard {...props} variant="list" badge="none" />;
}

