/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Send,
  Mic,
  MicOff,
  Sparkles,
  Brain,
  HeartPulse,
  Activity,
  Stethoscope,
  ShieldAlert,
  Wind,
  BookOpen,
  Loader2,
  ArrowDown,
  Square,
} from 'lucide-react';
import { API_TIMEOUT_MS, ChatMessage, Language } from '../types';
import { MessageItem } from './MessageItem';

interface ChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onEditMessage?: (messageId: string, newText: string) => Promise<void>;
  onStopGenerating?: () => void;
  isLoading: boolean;
  isStreaming?: boolean;
  lang: Language;
  externalDraft?: { text: string; seq: number } | null;
  onInputTextChange?: (text: string) => void;
}

const WAVEFORM_HEIGHT_CLASSES = [
  'h-1.5',
  'h-2',
  'h-2.5',
  'h-3',
  'h-3.5',
  'h-4',
  'h-5',
  'h-6',
] as const;

const DEFAULT_WAVEFORM_LEVELS = [1, 2, 1, 3, 2, 4, 3, 4, 2, 3, 1, 2, 1];

const HELP_HEADLINES = [
  {
    ar: 'أهلاً بيك في صحتي، تحب تسأل عن إيه النهارده؟',
    en: 'Welcome to Sehati! What would you like to ask about today?',
  },
  {
    ar: 'اسألني عن أي مرض أو حاجة تخص صحتك وهشرحهالك ببساطة',
    en: 'Ask about any condition or how your body works in simple terms',
  },
  {
    ar: 'معلومات طبية بسيطة تساعدك تفهم جسمك وتحافظ على صحتك',
    en: 'Simple health info to help you understand and care for your body',
  },
];

interface SuggestionItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  textAr: string;
  textEn: string;
  promptAr: string;
  promptEn: string;
  keywords: string[];
}

// Strict Medical Education suggestions (Zero diagnosis, zero treatment, zero dosing)
// textAr === promptAr and textEn === promptEn so the selected question matches what is submitted verbatim
const SUGGESTIONS_BANK: SuggestionItem[] = [
  {
    id: 's-diabetes',
    icon: ShieldAlert,
    textAr: 'ما هو مرض السكري وما أنواعه الرئيسية؟',
    textEn: 'What is diabetes and what are its main types?',
    promptAr: 'ما هو مرض السكري وما أنواعه الرئيسية؟',
    promptEn: 'What is diabetes and what are its main types?',
    keywords: [
      'سكري',
      'سكر',
      'انسولين',
      'أنسولين',
      'جلوكوز',
      'تراكمي',
      'بنكرياس',
      'diabetes',
      'diabetic',
      'insulin',
      'glucose',
      'blood sugar',
      'a1c',
      'hba1c',
    ],
  },
  {
    id: 's-hypertension',
    icon: HeartPulse,
    textAr: 'ما هو ارتفاع ضغط الدم وما عوامل الخطر الشائعة؟',
    textEn: 'What is hypertension and what are its common risk factors?',
    promptAr: 'ما هو ارتفاع ضغط الدم وما عوامل الخطر الشائعة؟',
    promptEn: 'What is hypertension and what are its common risk factors?',
    keywords: [
      'ضغط',
      'ضغط الدم',
      'ارتفاع الضغط',
      'الضغط العالي',
      'انقباضي',
      'انبساطي',
      'hypertension',
      'blood pressure',
      'high blood pressure',
      'pressure',
      'bp',
    ],
  },
  {
    id: 's-heart-anatomy',
    icon: Activity,
    textAr: 'كيف تعمل الدورة الدموية والقلب في جسم الإنسان؟',
    textEn: 'How do the human heart and blood circulation work?',
    promptAr: 'كيف تعمل الدورة الدموية والقلب في جسم الإنسان؟',
    promptEn: 'How do the human heart and blood circulation work?',
    keywords: [
      'قلب',
      'دورة دموية',
      'شرايين',
      'شريان',
      'اورده',
      'أوردة',
      'نبض',
      'نبضات',
      'ضربات القلب',
      'heart',
      'circulation',
      'cardiovascular',
      'cardiac',
      'arteries',
      'pulse',
      'anatomy',
    ],
  },
  {
    id: 's-asthma',
    icon: Wind,
    textAr: 'ما هو الربو وما الأعراض العامة المرتبطة به؟',
    textEn: 'What is asthma and what are its general symptoms?',
    promptAr: 'ما هو الربو وما الأعراض العامة المرتبطة به؟',
    promptEn: 'What is asthma and what are its general symptoms?',
    keywords: [
      'ربو',
      'تنفس',
      'نفس',
      'شعب هوائية',
      'رئة',
      'رئتين',
      'صدر',
      'حساسية الصدر',
      'صفير',
      'كحة',
      'سعال',
      'asthma',
      'respiratory',
      'lungs',
      'breathing',
      'airways',
      'wheezing',
      'cough',
    ],
  },
  {
    id: 's-anemia',
    icon: Stethoscope,
    textAr: 'ما هو فقر الدم (الأنيميا) وما أسبابه العامة؟',
    textEn: 'What is anemia and what are its general causes?',
    promptAr: 'ما هو فقر الدم (الأنيميا) وما أسبابه العامة؟',
    promptEn: 'What is anemia and what are its general causes?',
    keywords: [
      'انيميا',
      'أنيميا',
      'فقر دم',
      'فقر الدم',
      'هيموجلوبين',
      'حديد',
      'نقص الحديد',
      'كريات الدم',
      'دوخة',
      'ارهاق',
      'تعب',
      'anemia',
      'anaemia',
      'iron',
      'hemoglobin',
      'red blood cells',
      'fatigue',
    ],
  },
  {
    id: 's-immune',
    icon: Brain,
    textAr: 'كيف يعمل الجهاز المناعي وما المقصود بالالتهاب؟',
    textEn: 'How does the immune system function and what is inflammation?',
    promptAr: 'كيف يعمل الجهاز المناعي وما المقصود بالالتهاب؟',
    promptEn: 'How does the immune system function and what is inflammation?',
    keywords: [
      'مناعة',
      'مناعه',
      'التهاب',
      'التهابات',
      'جهاز مناعي',
      'اجسام مضادة',
      'خلايا بيضاء',
      'حساسية',
      'immune',
      'immunity',
      'inflammation',
      'antibodies',
      'white blood cells',
      'allergy',
    ],
  },
  {
    id: 's-terminology',
    icon: BookOpen,
    textAr: 'ما الفرق بين المرض الحاد والمزمن ومعنى كلمة حميد؟',
    textEn: 'What is the difference between acute and chronic, and what does benign mean?',
    promptAr: 'ما الفرق بين المرض الحاد والمزمن ومعنى كلمة حميد؟',
    promptEn: 'What is the difference between acute and chronic, and what does benign mean?',
    keywords: [
      'حاد',
      'مزمن',
      'حميد',
      'خبيث',
      'ورم',
      'مصطلح',
      'مصطلحات',
      'acute',
      'chronic',
      'benign',
      'malignant',
      'tumor',
      'terminology',
    ],
  },
  {
    id: 's-prevention',
    icon: Sparkles,
    textAr: 'ما المقصود بالتطعيم ومفاهيم الوقاية في الصحة العامة؟',
    textEn: 'What is vaccination and disease prevention in public health?',
    promptAr: 'ما المقصود بالتطعيم ومفاهيم الوقاية في الصحة العامة؟',
    promptEn: 'What is vaccination and disease prevention in public health?',
    keywords: [
      'وقاية',
      'وقايه',
      'تطعيم',
      'تطعيمات',
      'لقاح',
      'لقاحات',
      'مصل',
      'صحة عامة',
      'prevention',
      'vaccination',
      'vaccine',
      'immunization',
      'public health',
    ],
  },
  {
    id: 's-cholesterol',
    icon: HeartPulse,
    textAr: 'ما هو الكوليسترول وما الفرق بين الكوليسترول النافع والضار؟',
    textEn: 'What is cholesterol and what is the difference between HDL and LDL?',
    promptAr: 'ما هو الكوليسترول وما الفرق بين الكوليسترول النافع والضار؟',
    promptEn: 'What is cholesterol and what is the difference between HDL and LDL?',
    keywords: [
      'كوليسترول',
      'كولسترول',
      'دهون',
      'دهون ثلاثية',
      'تصلب الشرايين',
      'cholesterol',
      'hdl',
      'ldl',
      'lipids',
      'triglycerides',
    ],
  },
  {
    id: 's-thyroid',
    icon: Activity,
    textAr: 'ما هي الغدة الدرقية وما دورها في جسم الإنسان؟',
    textEn: 'What is the thyroid gland and what is its role in the body?',
    promptAr: 'ما هي الغدة الدرقية وما دورها في جسم الإنسان؟',
    promptEn: 'What is the thyroid gland and what is its role in the body?',
    keywords: [
      'غدة',
      'غده',
      'درقية',
      'درقيه',
      'الغدة الدرقية',
      'خمول الغدة',
      'نشاط الغدة',
      'هرمون',
      'هرمونات',
      'تمثيل غذائي',
      'thyroid',
      'tsh',
      'hormone',
      'hormones',
      'metabolism',
      'endocrine',
    ],
  },
  {
    id: 's-kidney',
    icon: Stethoscope,
    textAr: 'كيف تعمل الكلى وما هي أبرز وظائفها الحيوية؟',
    textEn: 'How do the kidneys work and what are their main vital functions?',
    promptAr: 'كيف تعمل الكلى وما هي أبرز وظائفها الحيوية؟',
    promptEn: 'How do the kidneys work and what are their main vital functions?',
    keywords: [
      'كلى',
      'كلي',
      'كلية',
      'كليتين',
      'حصوات',
      'حصوة',
      'بول',
      'مسالك بولية',
      'املاح',
      'kidney',
      'kidneys',
      'renal',
      'urinary',
      'kidney stones',
    ],
  },
  {
    id: 's-headache',
    icon: Brain,
    textAr: 'ما هي أنواع الصداع الشائعة وما الفرق بينها وبين الشقيقة؟',
    textEn: 'What are common types of headaches and how do they differ from migraines?',
    promptAr: 'ما هي أنواع الصداع الشائعة وما الفرق بينها وبين الشقيقة؟',
    promptEn: 'What are common types of headaches and how do they differ from migraines?',
    keywords: [
      'صداع',
      'صداع نصفي',
      'شقيقة',
      'شقيقه',
      'راس',
      'رأس',
      'مخ',
      'اعصاب',
      'headache',
      'migraine',
      'tension headache',
      'brain',
      'neurology',
    ],
  },
  {
    id: 's-digestive',
    icon: ShieldAlert,
    textAr: 'ما هو ارتجاع المريء وكيف يعمل الجهاز الهضمي؟',
    textEn: 'What is acid reflux (GERD) and how does the digestive system work?',
    promptAr: 'ما هو ارتجاع المريء وكيف يعمل الجهاز الهضمي؟',
    promptEn: 'What is acid reflux (GERD) and how does the digestive system work?',
    keywords: [
      'معدة',
      'معده',
      'هضم',
      'جهاز هضمي',
      'ارتجاع',
      'مريء',
      'حموضة',
      'حرقان',
      'قولون',
      'بطن',
      'مغص',
      'كبد',
      'stomach',
      'digestive',
      'digestion',
      'reflux',
      'gerd',
      'heartburn',
      'acid',
      'colon',
      'ibs',
      'liver',
    ],
  },
  {
    id: 's-vitamins',
    icon: Sparkles,
    textAr: 'ما أهمية فيتامين د والفيتامينات الأساسية لصحة الجسم؟',
    textEn: 'Why are vitamin D and essential vitamins important for the body?',
    promptAr: 'ما أهمية فيتامين د والفيتامينات الأساسية لصحة الجسم؟',
    promptEn: 'Why are vitamin D and essential vitamins important for the body?',
    keywords: [
      'فيتامين',
      'فيتامينات',
      'فيتامين د',
      'كالسيوم',
      'عظام',
      'تغذية',
      'معادن',
      'مكملات',
      'vitamin',
      'vitamins',
      'vitamin d',
      'vitamin b12',
      'calcium',
      'bones',
      'nutrition',
      'minerals',
    ],
  },
  {
    id: 's-sleep',
    icon: Brain,
    textAr: 'كيف يؤثر النوم الجيد والتوتر على صحة الجسم العامة؟',
    textEn: 'How do quality sleep and stress affect overall physical health?',
    promptAr: 'كيف يؤثر النوم الجيد والتوتر على صحة الجسم العامة؟',
    promptEn: 'How do quality sleep and stress affect overall physical health?',
    keywords: [
      'نوم',
      'ارق',
      'أرق',
      'توتر',
      'قلق',
      'ضغط نفسي',
      'اكتئاب',
      'صحة نفسية',
      'sleep',
      'insomnia',
      'stress',
      'anxiety',
      'depression',
      'mental health',
    ],
  },
  {
    id: 's-fever',
    icon: Wind,
    textAr: 'ما هي الحمى (ارتفاع الحرارة) وما الفرق بين العدوى الفيروسية والبكتيرية؟',
    textEn: 'What is fever and what is the difference between viral and bacterial infections?',
    promptAr: 'ما هي الحمى (ارتفاع الحرارة) وما الفرق بين العدوى الفيروسية والبكتيرية؟',
    promptEn: 'What is fever and what is the difference between viral and bacterial infections?',
    keywords: [
      'حمى',
      'سخونية',
      'سخونه',
      'حرارة',
      'حراره',
      'عدوى',
      'فيروس',
      'بكتيريا',
      'برد',
      'زكام',
      'انفلونزا',
      'رشح',
      'fever',
      'temperature',
      'infection',
      'viral',
      'virus',
      'bacterial',
      'bacteria',
      'cold',
      'flu',
    ],
  },
];

const SUGGESTION_STOPWORDS = new Set([
  // Arabic question words, prepositions & generic fillers
  'ما',
  'هو',
  'هي',
  'هم',
  'هل',
  'كيف',
  'ازاي',
  'ليه',
  'لماذا',
  'متي',
  'امتي',
  'اين',
  'فين',
  'عن',
  'في',
  'من',
  'علي',
  'الي',
  'مع',
  'او',
  'و',
  'يا',
  'ده',
  'دي',
  'ايه',
  'عايز',
  'عاوز',
  'اعرف',
  'ممكن',
  'تقولي',
  'اشرح',
  'اشرحلي',
  'مرض',
  'اعراض',
  'اسباب',
  'علاج',
  'دواء',
  'فرق',
  'بين',
  'معني',
  'كلمه',
  'مقصود',
  'جسم',
  'انسان',
  'عامه',
  'شائعه',
  'رئيسيه',
  'انواع',
  'انواعه',
  'عوامل',
  'خطر',
  'اهميه',
  'دور',
  'وظائف',
  'تعمل',
  'يعمل',
  'يؤثر',
  'صحه',
  // English question words, prepositions & generic fillers
  'what',
  'is',
  'are',
  'was',
  'were',
  'how',
  'does',
  'do',
  'did',
  'why',
  'when',
  'where',
  'who',
  'can',
  'could',
  'tell',
  'me',
  'about',
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'to',
  'for',
  'and',
  'or',
  'with',
  'my',
  'your',
  'its',
  'their',
  'main',
  'common',
  'general',
  'difference',
  'between',
  'mean',
  'meaning',
  'explain',
  'define',
  'disease',
  'symptoms',
  'causes',
  'types',
  'human',
  'body',
  'work',
  'health',
  'important',
  'role',
  'affect',
]);

function normalizeSearchText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripArabicPrefix(token: string): string {
  if (token.length >= 4 && token.startsWith('ال')) {
    return token.slice(2);
  }
  if (token.length >= 5 && (token.startsWith('وال') || token.startsWith('بال') || token.startsWith('لل'))) {
    return token.startsWith('لل') ? token.slice(2) : token.slice(3);
  }
  return token;
}

function extractMeaningfulTokens(str: string): string[] {
  const norm = normalizeSearchText(str);
  if (!norm) return [];
  return norm
    .split(/\s+/)
    .map(stripArabicPrefix)
    .filter((t) => t.length >= 2 && !SUGGESTION_STOPWORDS.has(t));
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  onSendMessage,
  onEditMessage,
  onStopGenerating,
  isLoading,
  isStreaming = false,
  lang,
  externalDraft,
  onInputTextChange,
}) => {
  const isAr = lang === 'ar';
  const isGenerating = isLoading || isStreaming;
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(DEFAULT_WAVEFORM_LEVELS);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomTextareaRef = useRef<HTMLTextAreaElement>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const latestInputRef = useRef('');
  const micSessionIdRef = useRef(0);
  const speechProducedTextRef = useRef(false);
  const baseInputBeforeMicRef = useRef('');
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const mediaStopResolverRef = useRef<(() => void) | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformRafRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  const onInputTextChangeRef = useRef(onInputTextChange);
  const appliedDraftSeqRef = useRef<number | null>(null);

  useEffect(() => {
    onInputTextChangeRef.current = onInputTextChange;
  }, [onInputTextChange]);

  const updateInputText = (value: string) => {
    latestInputRef.current = value;
    setInputText(value);
    onInputTextChangeRef.current?.(value);
  };

  useEffect(() => {
    if (!externalDraft || appliedDraftSeqRef.current === externalDraft.seq) return;
    appliedDraftSeqRef.current = externalDraft.seq;
    latestInputRef.current = externalDraft.text;
    setInputText(externalDraft.text);
    onInputTextChangeRef.current?.(externalDraft.text);
    const targetInput = inputRef.current || bottomTextareaRef.current;
    targetInput?.focus();
  }, [externalDraft]);

  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [isHeadlineFading, setIsHeadlineFading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsHeadlineFading(true);
      setTimeout(() => {
        setHeadlineIndex((prev) => (prev + 1) % HELP_HEADLINES.length);
        setIsHeadlineFading(false);
      }, 300);
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const matchedSuggestions = useMemo(() => {
    const rawQuery = inputText.trim();
    if (!rawQuery) {
      return SUGGESTIONS_BANK.slice(0, 4);
    }

    const normQuery = normalizeSearchText(rawQuery);
    const queryTokens = extractMeaningfulTokens(rawQuery);

    // If the user has only typed punctuation, single letters, or generic question words,
    // wait for a meaningful topic token rather than showing unrelated suggestions.
    if (queryTokens.length === 0) {
      return [];
    }

    const scored = SUGGESTIONS_BANK.map((item) => {
      let score = 0;
      const normKeywords = item.keywords.map(normalizeSearchText);
      const keywordTokens = item.keywords.flatMap((kw) => extractMeaningfulTokens(kw));
      const textTokens = [
        ...extractMeaningfulTokens(item.textAr),
        ...extractMeaningfulTokens(item.textEn),
      ];

      // Full multi-word keyword phrase match (strongest signal)
      for (const kw of normKeywords) {
        if (kw.includes(' ') && (normQuery.includes(kw) || (normQuery.length >= 4 && kw.startsWith(normQuery)))) {
          score += 6;
        }
      }

      // Token-level prefix/exact matching against curated keywords and meaningful text words
      for (const qw of queryTokens) {
        let bestTokenScore = 0;

        for (const kt of keywordTokens) {
          if (kt === qw) {
            bestTokenScore = Math.max(bestTokenScore, 5);
          } else if (kt.startsWith(qw)) {
            bestTokenScore = Math.max(bestTokenScore, 3);
          } else if (qw.length >= 3 && kt.length >= 3 && qw.startsWith(kt)) {
            bestTokenScore = Math.max(bestTokenScore, 3);
          }
        }

        if (bestTokenScore === 0) {
          for (const tt of textTokens) {
            if (tt === qw) {
              bestTokenScore = Math.max(bestTokenScore, 4);
            } else if (tt.startsWith(qw)) {
              bestTokenScore = Math.max(bestTokenScore, 2);
            } else if (qw.length >= 3 && tt.length >= 3 && qw.startsWith(tt)) {
              bestTokenScore = Math.max(bestTokenScore, 2);
            }
          }
        }

        score += bestTokenScore;
      }

      return { item, score };
    })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 4).map((entry) => entry.item);
  }, [inputText]);

  const handleSelectSuggestion = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;

    // Reset mic state cleanly and submit the exact selected question through the unified RAG + Safety Filter pipeline
    micSessionIdRef.current += 1;
    transcribeAbortRef.current?.abort();
    transcribeAbortRef.current = null;
    speechProducedTextRef.current = false;
    baseInputBeforeMicRef.current = '';
    audioChunksRef.current = [];

    if (isListening || recognitionRef.current || mediaRecorderRef.current) {
      void stopListening('submit', micSessionIdRef.current);
    }

    updateInputText('');
    void onSendMessage(trimmed);
  };


  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = scrollContainerRef.current;
    if (container) {
      if (behavior === 'auto') {
        container.scrollTop = container.scrollHeight;
      } else {
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom <= 96;
    shouldAutoScrollRef.current = isNearBottom;
    setShowScrollButton(!isNearBottom && messages.length > 0);
  }, [messages.length]);

  const handleJumpToBottom = useCallback(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
    scrollToBottom('smooth');
  }, [scrollToBottom]);

  // Follow new messages & loading state automatically when pinned to bottom or when user sends a new message
  useEffect(() => {
    if (messages.length === 0) {
      shouldAutoScrollRef.current = true;
      setShowScrollButton(false);
      prevMessageCountRef.current = 0;
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const isNewUserTurn =
      messages.length > prevMessageCountRef.current && lastMessage?.sender === 'user';
    prevMessageCountRef.current = messages.length;

    if (isNewUserTurn) {
      shouldAutoScrollRef.current = true;
      setShowScrollButton(false);
    }

    if (shouldAutoScrollRef.current) {
      const behavior: ScrollBehavior = isStreaming ? 'auto' : 'smooth';
      const rafId = window.requestAnimationFrame(() => {
        scrollToBottom(behavior);
      });
      return () => window.cancelAnimationFrame(rafId);
    }
  }, [messages, isLoading, isStreaming, scrollToBottom]);

  // Observe dynamic height changes (long AI responses, streaming updates, expanding blocks) to keep newest content in view
  useEffect(() => {
    const contentEl = messagesContentRef.current;
    if (!contentEl || messages.length === 0 || typeof ResizeObserver === 'undefined') return;

    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!shouldAutoScrollRef.current) return;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        scrollToBottom('auto');
        rafId = null;
      });
    });

    observer.observe(contentEl);
    return () => {
      observer.disconnect();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [messages.length > 0, scrollToBottom]);

  useEffect(() => {
    latestInputRef.current = inputText;
  }, [inputText]);

  const stopWaveform = useCallback(() => {
    if (waveformRafRef.current !== null) {
      window.cancelAnimationFrame(waveformRafRef.current);
      waveformRafRef.current = null;
    }
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    setAudioLevels(DEFAULT_WAVEFORM_LEVELS);
    setRecordingSeconds(0);
  }, []);

  const startWaveform = useCallback(
    (stream: MediaStream, sessionId: number) => {
      stopWaveform();
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        if (micSessionIdRef.current !== sessionId) return;
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      try {
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const barCount = DEFAULT_WAVEFORM_LEVELS.length;
        const centerIdx = Math.floor(barCount / 2);
        let lastFrameAt = 0;

        const tick = (now: number) => {
          if (micSessionIdRef.current !== sessionId || !analyserRef.current) return;
          if (now - lastFrameAt >= 45) {
            lastFrameAt = now;
            analyserRef.current.getByteFrequencyData(dataArray);
            const nextLevels: number[] = [];
            for (let i = 0; i < barCount; i++) {
              const distFromCenter = Math.abs(i - centerIdx);
              const binIdx = Math.min(dataArray.length - 1, distFromCenter + 1);
              const rawEnergy = (dataArray[binIdx] || 0) / 255;
              const idlePulse =
                0.12 + 0.08 * Math.sin(now / 180 + i * 0.7);
              const combined = Math.min(1, Math.max(idlePulse, rawEnergy * 1.45));
              const bucket = Math.min(
                WAVEFORM_HEIGHT_CLASSES.length - 1,
                Math.max(0, Math.round(combined * (WAVEFORM_HEIGHT_CLASSES.length - 1)))
              );
              nextLevels.push(bucket);
            }
            setAudioLevels(nextLevels);
          }
          waveformRafRef.current = window.requestAnimationFrame(tick);
        };

        waveformRafRef.current = window.requestAnimationFrame(tick);
      } catch {
        // Fallback subtle animated wave if AudioContext is restricted
        let phase = 0;
        const fallbackTick = () => {
          if (micSessionIdRef.current !== sessionId) return;
          phase += 0.25;
          setAudioLevels(
            DEFAULT_WAVEFORM_LEVELS.map((_, i) =>
              Math.min(
                WAVEFORM_HEIGHT_CLASSES.length - 1,
                Math.max(1, Math.round(2.5 + 2 * Math.sin(phase + i * 0.6)))
              )
            )
          );
          waveformRafRef.current = window.requestAnimationFrame(fallbackTick);
        };
        waveformRafRef.current = window.requestAnimationFrame(fallbackTick);
      }
    },
    [stopWaveform]
  );

  useEffect(() => {
    return () => {
      micSessionIdRef.current += 1;
      transcribeAbortRef.current?.abort();
      stopWaveform();
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stopWaveform]);

  const blobToBase64 = (blob: Blob): Promise<string | null> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string' && result.includes(',')) {
          resolve(result.split(',')[1] || null);
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

  const stopListening = async (
    reason: 'user' | 'ended' | 'submit' = 'user',
    expectedSessionId?: number
  ) => {
    const sessionId = expectedSessionId ?? micSessionIdRef.current;
    setIsListening(false);
    stopWaveform();

    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        mediaStopResolverRef.current = done;
        window.setTimeout(done, 350);
        try {
          recorder.stop();
        } catch {
          done();
        }
      });
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    const recordedChunks = audioChunksRef.current;
    audioChunksRef.current = [];
    const mimeType = recorder?.mimeType || 'audio/webm';

    if (reason !== 'submit') {
      window.setTimeout(() => {
        if (messages.length === 0) inputRef.current?.focus();
        else bottomTextareaRef.current?.focus();
      }, 100);
    }

    // Never fall back to /api/transcribe if:
    // - user submitted the prompt, OR session changed/reset
    // - Web SpeechRecognition already wrote recognized speech for this session
    if (
      reason === 'submit' ||
      micSessionIdRef.current !== sessionId ||
      speechProducedTextRef.current
    ) {
      return;
    }

    try {
      const blob = new Blob(recordedChunks, { type: mimeType });
      if (blob.size <= 2000) return;

      const base64Audio = await blobToBase64(blob);
      if (
        !base64Audio ||
        micSessionIdRef.current !== sessionId ||
        speechProducedTextRef.current
      ) {
        return;
      }

      transcribeAbortRef.current?.abort();
      const abortController = new AbortController();
      transcribeAbortRef.current = abortController;
      const transcribeTimeout = window.setTimeout(() => {
        abortController.abort();
      }, API_TIMEOUT_MS);

      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            audio: base64Audio,
            mimeType,
            lang,
          }),
        });

        if (!res.ok) return;
        const data = await res.json();
        const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';

        if (
          transcript &&
          micSessionIdRef.current === sessionId &&
          !speechProducedTextRef.current &&
          !abortController.signal.aborted
        ) {
          const prefix = baseInputBeforeMicRef.current;
          const nextText = prefix ? `${prefix} ${transcript}` : transcript;
          speechProducedTextRef.current = true;
          updateInputText(nextText);
        }
      } finally {
        window.clearTimeout(transcribeTimeout);
      }
    } catch {}
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = latestInputRef.current.trim();
    if (!text || isGenerating) return;

    // Reset all microphone & transcription state cleanly so submitted speech cannot reappear
    micSessionIdRef.current += 1;
    transcribeAbortRef.current?.abort();
    transcribeAbortRef.current = null;
    speechProducedTextRef.current = false;
    baseInputBeforeMicRef.current = '';
    audioChunksRef.current = [];

    if (isListening || recognitionRef.current || mediaRecorderRef.current) {
      void stopListening('submit', micSessionIdRef.current);
    }

    updateInputText('');
    onSendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startListening = async () => {
    if (isListening) return;
    const sessionId = ++micSessionIdRef.current;
    transcribeAbortRef.current?.abort();
    transcribeAbortRef.current = null;
    speechProducedTextRef.current = false;
    baseInputBeforeMicRef.current = latestInputRef.current.trim();
    audioChunksRef.current = [];

    try {
      if (!navigator?.mediaDevices?.getUserMedia) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (micSessionIdRef.current !== sessionId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      mediaStreamRef.current = stream;

      const supportedMime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0 && micSessionIdRef.current === sessionId) {
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        mediaStopResolverRef.current?.();
        mediaStopResolverRef.current = null;
      };
      recorder.start(250);
      setIsListening(true);
      startWaveform(stream, sessionId);

      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const recognition = new SpeechRec();
          recognitionRef.current = recognition;
          recognition.lang = isAr ? 'ar-EG' : 'en-US';
          recognition.continuous = false;
          recognition.interimResults = true;

          recognition.onresult = (event: any) => {
            if (micSessionIdRef.current !== sessionId) return;
            let interim = '';
            let finalText = '';
            for (let i = 0; i < event.results.length; i++) {
              const part = (event.results[i][0]?.transcript || '').trim();
              if (!part) continue;
              if (event.results[i].isFinal) {
                finalText += (finalText ? ' ' : '') + part;
              } else {
                interim += (interim ? ' ' : '') + part;
              }
            }
            const spoken = (finalText || interim).trim();
            if (spoken) {
              speechProducedTextRef.current = true;
              const prefix = baseInputBeforeMicRef.current;
              updateInputText(prefix ? `${prefix} ${spoken}` : spoken);
            }
          };

          recognition.onend = () => {
            if (
              micSessionIdRef.current === sessionId &&
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === 'recording'
            ) {
              void stopListening('ended', sessionId);
            }
          };

          recognition.start();
        } catch {}
      }
    } catch {
      setIsListening(false);
    }
  };

  const handleToggleMic = () => {
    if (isListening) void stopListening('user');
    else void startListening();
  };

  const formattedRecordingTime = `${Math.floor(recordingSeconds / 60)}:${String(
    recordingSeconds % 60
  ).padStart(2, '0')}`;

  const renderWaveformIndicator = () => {
    if (!isListening) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-2.5 flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-red-50/90 dark:bg-red-950/35 border border-red-200/80 dark:border-red-800/50 shadow-xs animate-in fade-in slide-in-from-bottom-1 duration-150"
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span className="text-xs font-semibold text-red-700 dark:text-red-300">
            {isAr ? 'جارٍ الاستماع...' : 'Listening...'}
          </span>
          <span className="text-[0.6875rem] font-mono tabular-nums text-red-600/80 dark:text-red-300/80">
            {formattedRecordingTime}
          </span>
        </div>

        <div
          aria-hidden="true"
          className="flex-1 flex items-center justify-center gap-[3px] h-6 overflow-hidden"
        >
          {audioLevels.map((levelIdx, idx) => (
            <span
              key={idx}
              className={`w-[3px] rounded-full bg-red-500 dark:bg-red-400 transition-all duration-75 ${
                WAVEFORM_HEIGHT_CLASSES[levelIdx] || 'h-2'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => void stopListening('user')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer shrink-0"
          title={isAr ? 'إيقاف التسجيل' : 'Stop recording'}
        >
          <Square className="w-2.5 h-2.5 fill-current" />
          <span>{isAr ? 'إيقاف' : 'Stop'}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full max-h-full w-full relative overflow-hidden items-center justify-center">
      {/* Soft Radial Green Glow & Smooth Gradient Backdrop (only on initial welcome screen before chat starts) */}
      {messages.length === 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 z-0 overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_50%,rgba(16,185,129,0.13)_0%,rgba(52,211,153,0.07)_32%,rgba(16,185,129,0.025)_60%,transparent_86%)] dark:bg-[radial-gradient(ellipse_80%_70%_at_50%_50%,rgba(16,185,129,0.13)_0%,rgba(5,150,105,0.07)_34%,rgba(6,95,70,0.025)_62%,transparent_86%)]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[22rem] sm:w-[52rem] sm:h-[30rem] rounded-full bg-emerald-400/10 dark:bg-emerald-500/10 blur-[110px]" />
        </div>
      )}

      {/* Main Chat Column */}
      <div className="flex-1 min-h-0 flex flex-col h-full relative z-10 overflow-hidden items-center justify-center w-full">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={`flex-1 min-h-0 w-full overscroll-y-contain ${
            messages.length === 0
              ? 'overflow-y-auto flex flex-col items-center justify-center'
              : 'overflow-y-auto flex flex-col justify-between pt-12'
          } overflow-x-hidden px-3 sm:px-6 py-2 relative`}
        >
          {messages.length > 0 && (
            <div
              ref={messagesContentRef}
              className="max-w-4xl w-full mx-auto space-y-3.5 relative z-10 px-1 sm:px-2 pb-2"
            >
              {messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  lang={lang}
                  onSelectFollowUp={(q) => onSendMessage(q)}
                  onEditMessage={onEditMessage}
                  isLoading={isGenerating}
                />
              ))}

              {isLoading && !isStreaming && (
                <div
                  data-tour="waiting-indicator"
                  className="flex items-center gap-1.5 py-3 px-2 text-zinc-400 dark:text-zinc-500 w-fit"
                  aria-label={isAr ? 'جارٍ استرجاع الأدلة وتوليد الإجابة' : 'Retrieving evidence and generating response'}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-bounce"></span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {messages.length === 0 && (
            <div className="relative my-auto py-4 sm:py-6 px-3 sm:px-6 flex flex-col items-center justify-center max-w-4xl w-full mx-auto animate-in fade-in duration-300">
              <div className="w-full text-center mb-4 sm:mb-5">
                <h1
                  className={`text-base sm:text-xl font-bold text-zinc-800 dark:text-zinc-100 text-center tracking-normal transition-all duration-300 min-h-[2.2rem] flex items-center justify-center select-none ${
                    isHeadlineFading
                      ? 'opacity-0 -translate-y-1 scale-98'
                      : 'opacity-100 translate-y-0 scale-100'
                  }`}
                >
                  {isAr ? HELP_HEADLINES[headlineIndex].ar : HELP_HEADLINES[headlineIndex].en}
                </h1>
              </div>

              <form onSubmit={handleSubmit} className="w-full max-w-4xl">
                {renderWaveformIndicator()}
                <div
                  data-tour="chat-input"
                  className="w-full flex items-center gap-3 bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-md px-5 sm:px-7 py-4 sm:py-4.5 rounded-[30px] border-2 border-emerald-500/40 dark:border-emerald-500/35 shadow-[0_6px_35px_rgba(16,185,129,0.22)] dark:shadow-[0_6px_40px_rgba(16,185,129,0.28)] hover:border-emerald-500/60 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/20 transition-all"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => updateInputText(e.target.value)}
                    placeholder={isAr ? 'اسأل صحتي' : 'Ask Sehati'}
                    className="flex-1 bg-transparent border-0 text-base sm:text-lg focus:outline-hidden text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 px-1"
                  />

                  {isGenerating && (
                    <span
                      role="status"
                      aria-label={isAr ? 'جارٍ التفكير...' : 'Thinking...'}
                      title={isAr ? 'جارٍ التفكير...' : 'Thinking...'}
                      className="flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleMic}
                    className={`p-2.5 rounded-full transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                      isListening
                        ? 'bg-red-500 text-white animate-pulse shadow-md ring-4 ring-red-400/40'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10'
                    }`}
                    title={
                      isListening
                        ? isAr
                          ? 'اضغط لإيقاف التسجيل'
                          : 'Click to stop'
                        : isAr
                        ? 'تسجيل صوتي'
                        : 'Voice input'
                    }
                  >
                    {isListening ? (
                      <MicOff className="w-4 h-4 animate-bounce" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </button>

                  {isGenerating && onStopGenerating ? (
                    <button
                      type="button"
                      data-tour="stop-button"
                      onClick={onStopGenerating}
                      className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-xs"
                      title={isAr ? 'إيقاف التوليد' : 'Stop generating'}
                      aria-label={isAr ? 'إيقاف التوليد' : 'Stop generating'}
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      data-tour="send-button"
                      disabled={!inputText.trim() || isGenerating}
                      className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-35 text-white rounded-full transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-xs"
                      title={isAr ? 'إرسال' : 'Send'}
                    >
                      <Send className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              </form>

              {matchedSuggestions.length > 0 && (
                <div className="w-full max-w-4xl mt-3 sm:mt-4 animate-in fade-in duration-200">
                  <div className="space-y-2 text-start max-h-56 overflow-y-auto no-scrollbar px-2">
                    {matchedSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(isAr ? item.promptAr : item.promptEn)}
                        disabled={isGenerating}
                        className="w-full text-start py-1.5 text-sm sm:text-[0.9375rem] font-normal text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer block select-none focus:outline-hidden"
                      >
                        {isAr ? item.textAr : item.textEn}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {messages.length > 0 && (
          <div className="shrink-0 w-full px-3 sm:px-6 pt-1 pb-2 sm:pb-3 relative">
            {showScrollButton && (
              <button
                type="button"
                onClick={handleJumpToBottom}
                aria-label={isAr ? 'النزول لآخر رسالة' : 'Scroll to newest message'}
                title={isAr ? 'النزول لآخر رسالة' : 'Scroll to bottom'}
                className="absolute -top-11 left-1/2 -translate-x-1/2 z-20 w-8 h-8 rounded-full bg-white/95 dark:bg-zinc-800/95 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500 shadow-md flex items-center justify-center transition-all cursor-pointer animate-in fade-in zoom-in-95 duration-150"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            )}
            {inputText.trim().length > 0 && matchedSuggestions.length > 0 && (
              <div className="mb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-4xl mx-auto">
                <span className="text-[0.625rem] font-bold text-emerald-600 dark:text-emerald-400 px-1 shrink-0 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  {isAr ? 'مقترحات:' : 'Matches:'}
                </span>
                {matchedSuggestions.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => handleSelectSuggestion(isAr ? item.promptAr : item.promptEn)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.6875rem] bg-white/90 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-emerald-500/30 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer shadow-2xs disabled:opacity-40"
                  >
                    <span className="truncate max-w-[220px]">
                      {isAr ? item.textAr : item.textEn}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto">
              {renderWaveformIndicator()}
              <div
                data-tour="chat-input"
                className="w-full flex items-center gap-2.5 bg-[#f4f4f4] dark:bg-[#262626] p-3 sm:p-3.5 rounded-[28px] border-2 border-emerald-500/30 dark:border-emerald-500/25 shadow-xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all"
              >
                <textarea
                  ref={bottomTextareaRef}
                  rows={1}
                  value={inputText}
                  onChange={(e) => updateInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isAr
                      ? 'اسأل صحتي...'
                      : 'Ask Sehati...'
                  }
                  className="flex-1 bg-transparent border-0 resize-none text-[0.9375rem] sm:text-base focus:outline-hidden text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 px-3 py-1.5 max-h-32"
                />

                {isGenerating && (
                  <span
                    role="status"
                    aria-label={isAr ? 'جارٍ التفكير...' : 'Thinking...'}
                    title={isAr ? 'جارٍ التفكير...' : 'Thinking...'}
                    className="flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`p-2 rounded-full transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-md ring-2 ring-red-400/50'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                  title={
                    isListening
                      ? isAr
                        ? 'اضغط لإيقاف التسجيل'
                        : 'Stop recording'
                      : isAr
                      ? 'تسجيل صوتي'
                      : 'Voice input'
                  }
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4 animate-bounce" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>

                {isGenerating && onStopGenerating ? (
                  <button
                    type="button"
                    data-tour="stop-button"
                    onClick={onStopGenerating}
                    className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all flex items-center justify-center font-bold text-xs cursor-pointer shadow-xs shrink-0"
                    title={isAr ? 'إيقاف التوليد' : 'Stop generating'}
                    aria-label={isAr ? 'إيقاف التوليد' : 'Stop generating'}
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    data-tour="send-button"
                    disabled={!inputText.trim() || isGenerating}
                    className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-35 text-white rounded-full transition-all flex items-center justify-center font-bold text-xs cursor-pointer shadow-xs shrink-0"
                    title={isAr ? 'إرسال' : 'Send'}
                  >
                    <Send className={`w-4 h-4 ${isAr ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
            </form>

            <p className="mt-1.5 text-center text-[0.6875rem] sm:text-xs text-zinc-500 dark:text-zinc-400 select-none">
              {isAr
                ? 'صحتي هو مساعدك في المعلومات الطبية وممكن يغلط.'
                : 'Sehati is your medical information assistant and can make mistakes.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
