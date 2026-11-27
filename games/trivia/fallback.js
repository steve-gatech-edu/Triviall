// Bundled starter questions, used when the Open Trivia Database is unreachable or rate limited.
// 20 original general-knowledge items. The spec calls for at least 50; growing this set is a tracked task.
const q = (category, prompt, correctAnswer, ...incorrectAnswers) => ({ category, type: 'multiple', prompt, correctAnswer, incorrectAnswers });
export const FALLBACK_QUESTIONS = [
  q('Geography', 'What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'),
  q('Science', 'What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go'),
  q('Science', 'Which planet is closest to the Sun?', 'Mercury', 'Venus', 'Mars', 'Earth'),
  q('History', 'In which year did the Berlin Wall fall?', '1989', '1991', '1985', '1979'),
  q('Geography', 'Which is the longest river in Africa?', 'Nile', 'Congo', 'Niger', 'Zambezi'),
  q('Science', 'What is the hardest naturally occurring substance?', 'Diamond', 'Quartz', 'Topaz', 'Graphite'),
  q('Art', 'Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Donatello'),
  q('Science', 'How many bones are in an adult human body?', '206', '196', '212', '256'),
  q('Geography', 'Which is the largest ocean?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'),
  q('Literature', 'Who wrote Pride and Prejudice?', 'Jane Austen', 'Charlotte Bronte', 'George Eliot', 'Mary Shelley'),
  q('Science', 'Which gas do plants absorb from the air for photosynthesis?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'),
  q('Sports', 'How many players does one soccer team have on the field?', '11', '9', '10', '12'),
  q('Geography', 'Marrakech is a city in which country?', 'Morocco', 'Tunisia', 'Egypt', 'Algeria'),
  q('Music', 'How many strings does a standard violin have?', '4', '5', '6', '3'),
  q('Science', 'Which force pulls objects toward the Earth?', 'Gravity', 'Magnetism', 'Friction', 'Inertia'),
  q('Food', 'What is the main ingredient of guacamole?', 'Avocado', 'Tomato', 'Cucumber', 'Pea'),
  q('Math', 'What is the square root of 144?', '12', '14', '16', '11'),
  q('History', 'Which civilization built the pyramids at Giza?', 'Ancient Egyptian', 'Mayan', 'Roman', 'Persian'),
  q('Geography', 'Which is the smallest country in the world by area?', 'Vatican City', 'Monaco', 'San Marino', 'Liechtenstein'),
  q('Science', 'Which planet is known as the Red Planet?', 'Mars', 'Jupiter', 'Saturn', 'Venus'),
];
