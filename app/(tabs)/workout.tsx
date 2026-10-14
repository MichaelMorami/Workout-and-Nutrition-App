import { Text, View } from 'react-native';
import { CarouselPage } from '../../src/components/navigation/CarouselPage';

// Placeholder screen — deliberately unstyled. Real design lands once
// design-lead's visual design is approved.
// `<CarouselPage>` wraps it (issue #82) so a swipe to/from Today or Charts slides this screen with
// the finger, the same as every other tab root — see `app/(tabs)/index.tsx`'s own module note.
export default function WorkoutScreen() {
  return (
    <CarouselPage testID="workout-carousel-page">
      <View>
        <Text>Workout</Text>
      </View>
    </CarouselPage>
  );
}
