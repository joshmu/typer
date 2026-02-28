export interface Quote {
	text: string;
	source: string;
	length: "short" | "medium" | "long";
}

const quotes: Quote[] = [
	// Short (under 100 chars)
	{ text: "The only way to do great work is to love what you do.", source: "Steve Jobs", length: "short" },
	{ text: "In the middle of difficulty lies opportunity.", source: "Albert Einstein", length: "short" },
	{ text: "The best time to plant a tree was twenty years ago. The second best time is now.", source: "Chinese Proverb", length: "short" },
	{ text: "Simplicity is the ultimate sophistication.", source: "Leonardo da Vinci", length: "short" },
	{ text: "Stay hungry, stay foolish.", source: "Steve Jobs", length: "short" },
	{ text: "The only true wisdom is in knowing you know nothing.", source: "Socrates", length: "short" },
	{ text: "Life is what happens when you are busy making other plans.", source: "John Lennon", length: "short" },
	{ text: "The future belongs to those who believe in the beauty of their dreams.", source: "Eleanor Roosevelt", length: "short" },
	{ text: "It is during our darkest moments that we must focus to see the light.", source: "Aristotle", length: "short" },
	{ text: "Do what you can, with what you have, where you are.", source: "Theodore Roosevelt", length: "short" },
	{ text: "Not all those who wander are lost.", source: "J.R.R. Tolkien", length: "short" },
	{ text: "The journey of a thousand miles begins with one step.", source: "Lao Tzu", length: "short" },
	{ text: "What we think, we become.", source: "Buddha", length: "short" },
	{ text: "Turn your wounds into wisdom.", source: "Oprah Winfrey", length: "short" },
	{ text: "Every moment is a fresh beginning.", source: "T.S. Eliot", length: "short" },

	// Medium (100-200 chars)
	{ text: "Two things are infinite: the universe and human stupidity; and I am not sure about the universe. But I am sure about the stupidity.", source: "Albert Einstein", length: "medium" },
	{ text: "In three words I can sum up everything I have learned about life: it goes on. No matter what happens, life continues to move forward.", source: "Robert Frost", length: "medium" },
	{ text: "The greatest glory in living lies not in never falling, but in rising every time we fall. We must pick ourselves up and keep going.", source: "Nelson Mandela", length: "medium" },
	{ text: "If you look at what you have in life, you will always have more. If you look at what you do not have in life, you will never have enough.", source: "Oprah Winfrey", length: "medium" },
	{ text: "You must be the change you wish to see in the world. Nobody can bring you peace but yourself. Start where you are and do what you can.", source: "Mahatma Gandhi", length: "medium" },
	{ text: "Success is not final, failure is not fatal: it is the courage to continue that counts. Keep moving forward no matter what stands in your way.", source: "Winston Churchill", length: "medium" },
	{ text: "The only impossible journey is the one you never begin. Take the first step in faith. You do not have to see the whole staircase.", source: "Martin Luther King Jr.", length: "medium" },
	{ text: "It does not matter how slowly you go as long as you do not stop. Persistence and determination alone are omnipotent in the pursuit of goals.", source: "Confucius", length: "medium" },

	// Long (200+ chars)
	{ text: "I have learned over the years that when one's mind is made up, this diminishes fear; knowing what must be done does away with fear. The brave man is not he who does not feel afraid, but he who conquers that fear and moves forward with courage and determination.", source: "Rosa Parks", length: "long" },
	{ text: "Twenty years from now you will be more disappointed by the things that you did not do than by the ones you did do. So throw off the bowlines. Sail away from the safe harbor. Catch the trade winds in your sails. Explore. Dream. Discover. The world is waiting for you.", source: "Mark Twain", length: "long" },
	{ text: "It is not the critic who counts; not the man who points out how the strong man stumbles, or where the doer of deeds could have done them better. The credit belongs to the man who is actually in the arena, whose face is marred by dust and sweat and blood.", source: "Theodore Roosevelt", length: "long" },
	{ text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit. The things we do every day shape who we become. Small actions taken consistently over time create extraordinary results and build the foundation of a remarkable life.", source: "Aristotle", length: "long" },
	{ text: "The secret of getting ahead is getting started. The secret of getting started is breaking your complex overwhelming tasks into small manageable tasks, and then starting on the first one. Do not wait for the perfect moment. Take the moment and make it perfect.", source: "Mark Twain", length: "long" },
];

export function getRandomQuote(length?: "short" | "medium" | "long"): Quote {
	const filtered = length ? quotes.filter((q) => q.length === length) : quotes;
	return filtered[Math.floor(Math.random() * filtered.length)];
}

export function getQuotesByLength(length: "short" | "medium" | "long"): Quote[] {
	return quotes.filter((q) => q.length === length);
}
