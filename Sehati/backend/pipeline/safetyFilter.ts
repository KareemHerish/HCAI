/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatTurnHistory, Language, RagApiPayload } from '../types.js';
import {
  ClassificationResult,
  classifyDomainHeuristic,
  classifyDomainSemantic,
  detectQueryLanguage,
  SemanticClassifierOptions,
} from './domainClassifier.js';
import { normalizeFollowUpToUserRequest } from './responseValidator.js';

export const EDUCATIONAL_DISCLAIMER_EN =
  'This response provides general medical information for educational purposes only. It does not provide diagnosis, treatment, prescriptions, or personalized medical advice.';

export const EDUCATIONAL_DISCLAIMER_AR =
  'تقدم هذه الإجابة معلومات طبية عامة لأغراض التثقيف الصحي فقط، ولا تُعد تشخيصاً طبياً أو خطة علاجية أو وصفة دوائية أو استشارة طبية شخصية.';

export function buildDynamicOutOfScopeFallback(query: string, lang: Language): string {
  const snippet = (query || '').trim().slice(0, 80);
  if (lang === 'ar') {
    return snippet
      ? `الإجابة على طلب مثل "${snippet}" ليست ضمن مهامي، لأنني مساعد مخصص لتقديم المعلومات الطبية والتثقيف الصحي العام فقط. يسعدني مساعدتك إذا كان لديك أي سؤال طبي أو صحي عام.`
      : 'هذا الطلب ليس ضمن مهامي، لأنني مساعد مخصص لتقديم المعلومات الطبية والتثقيف الصحي العام فقط. يسعدني مساعدتك إذا كان لديك أي سؤال طبي أو صحي عام.';
  }
  return snippet
    ? `Handling a request like "${snippet}" is not part of my role, as I am dedicated strictly to general medical and health education. Feel free to ask me any general medical or health-related question.`
    : 'Handling this request is not part of my role, as I am dedicated strictly to general medical and health education. Feel free to ask me any general medical or health-related question.';
}

export interface SafetyFilterDecision {
  allowed: boolean;
  classification: ClassificationResult;
  earlyResponse?: RagApiPayload;
}

export function buildSafetyEarlyDecision(
  query: string,
  classification: ClassificationResult,
  uiLang: Language,
  startTimeMs: number,
  usedModelName?: string
): SafetyFilterDecision {
  const detected = detectQueryLanguage(query);
  const lang: Language = uiLang === 'en' ? 'en' : 'ar';
  const elapsed = () => Number(((Date.now() - startTimeMs) / 1000).toFixed(3));

  if (classification.category === 'SAFE_MEDICAL_EDUCATION') {
    return { allowed: true, classification };
  }

  const makePayload = (
    status: RagApiPayload['status'],
    directAnswerAr: string,
    directAnswerEn: string,
    detailAr: string,
    detailEn: string,
    followUpsAr: string[],
    followUpsEn: string[],
    includeDisclaimer = true
  ): RagApiPayload => {
    const hasDynamic = Boolean(classification.dynamicResponse?.trim());
    const direct = hasDynamic
      ? classification.dynamicResponse!.trim()
      : lang === 'ar'
      ? directAnswerAr
      : directAnswerEn;
    const detail = hasDynamic ? '' : lang === 'ar' ? detailAr : detailEn;
    const disclaimer = includeDisclaimer
      ? lang === 'ar'
        ? EDUCATIONAL_DISCLAIMER_AR
        : EDUCATIONAL_DISCLAIMER_EN
      : '';
    const followUps =
      classification.dynamicFollowUps && classification.dynamicFollowUps.length > 0
        ? classification.dynamicFollowUps.map((q) => normalizeFollowUpToUserRequest(q, lang))
        : lang === 'ar'
        ? followUpsAr
        : followUpsEn;
    const reply = detail ? `${direct}\n\n${detail}` : direct;

    return {
      status,
      language: lang,
      category: classification.category,
      knowledge_source: 'none',
      answer: {
        direct_answer: direct,
        detailed_explanation: detail,
        retrieved_context_summary:
          lang === 'ar'
            ? 'تمت معالجة الطلب عبر التوجيه الدلالي وتحديد النطاق قبل التوليد.'
            : 'This request was handled by the semantic scope and safety gate.',
        educational_disclaimer: disclaimer,
      },
      sources: [],
      follow_up_questions: followUps,
      reply,
      seconds: elapsed(),
      model:
        usedModelName ||
        (classification.classificationSource === 'semantic_llm'
          ? 'Semantic Safety Filter'
          : 'Pre-Retrieval Safety Gate'),
      triggerType: classification.triggerType,
      matchedPattern: classification.matchedPattern,
      evidence_used: [],
      pipeline_trace: {
        category: classification.category,
        detected_language: detected,
        retrieved_count: 0,
        validated_count: 0,
        validation_passed: true,
        knowledge_source: 'none',
        classification_source: classification.classificationSource,
      },
    };
  };

  switch (classification.category) {
    case 'GREETING': {
      const isConversationalDynamic = Boolean(classification.dynamicResponse?.trim());
      return {
        allowed: false,
        classification,
        earlyResponse: makePayload(
          'greeting',
          'أهلاً بك! أنا صحتي، مساعدك للمعلومات الطبية والتثقيف الصحي العام. كيف يمكنني مساعدتك اليوم؟',
          "Hello! I'm Sehati, your general medical and health education assistant. How can I help you today?",
          '',
          '',
          isConversationalDynamic
            ? []
            : [
                'ما هو مرض السكري وما أنواعه الرئيسية؟',
                'كيف تعمل الدورة الدموية والقلب في جسم الإنسان؟',
              ],
          isConversationalDynamic
            ? []
            : [
                'What is diabetes and what are its main types?',
                'How do the human heart and blood circulation work?',
              ],
          false
        ),
      };
    }

    case 'EMERGENCY': {
      const countryEmergencyAr: Record<string, string> = {
        SA: '🚨 تنبيه طوارئ فوري: يُرجى الاتصال فوراً برقم الإسعاف في السعودية (**997** أو **911**) أو التوجه فوراً لأقرب قسم طوارئ.',
        IQ: '🚨 تنبيه طوارئ فوري: يُرجى الاتصال فوراً برقم الطوارئ/الإسعاف في العراق (**122** أو **104**) أو التوجه فوراً لأقرب قسم طوارئ.',
        AE: '🚨 تنبيه طوارئ فوري: يُرجى الاتصال فوراً برقم الإسعاف في الإمارات (**998** أو **999**) أو التوجه فوراً لأقرب قسم طوارئ.',
        JO: '🚨 تنبيه طوارئ فوري: يُرجى الاتصال فوراً برقم الطوارئ في الأردن (**911**) أو التوجه فوراً لأقرب قسم طوارئ.',
        KW: '🚨 تنبيه طوارئ فوري: يُرجى الاتصال فوراً برقم الطوارئ في الكويت (**112**) أو التوجه فوراً لأقرب قسم طوارئ.',
        EG: '🚨 تنبيه طوارئ فوري: يُرجى الاتصال فوراً برقم الإسعاف في مصر (**123**) أو التوجه فوراً لأقرب قسم طوارئ.',
      };
      const countryEmergencyEn: Record<string, string> = {
        SA: '🚨 Immediate Emergency Alert: Call ambulance/emergency services in Saudi Arabia (**997** or **911**) immediately or go to the nearest emergency room.',
        IQ: '🚨 Immediate Emergency Alert: Call emergency services in Iraq (**122** or **104**) immediately or go to the nearest emergency room.',
        AE: '🚨 Immediate Emergency Alert: Call emergency services in the UAE (**998** or **999**) immediately or go to the nearest emergency room.',
        JO: '🚨 Immediate Emergency Alert: Call emergency services in Jordan (**911**) immediately or go to the nearest emergency room.',
        KW: '🚨 Immediate Emergency Alert: Call emergency services in Kuwait (**112**) immediately or go to the nearest emergency room.',
        EG: '🚨 Immediate Emergency Alert: Call Egypt emergency ambulance **123** immediately or go to the nearest emergency room.',
      };

      const hintKey = classification.countryHint && classification.countryHint !== 'OTHER'
        ? classification.countryHint
        : classification.isEgyptConfirmed
        ? 'EG'
        : null;

      const egyptLineAr = hintKey
        ? countryEmergencyAr[hintKey]
        : '🚨 تنبيه طوارئ فوري: يُرجى الاتصال برقم الطوارئ أو الإسعاف المحلي في بلدك فوراً أو التوجه لأقرب قسم طوارئ.';

      const egyptLineEn = hintKey
        ? countryEmergencyEn[hintKey]
        : '🚨 Immediate Emergency Alert: Contact your local emergency services immediately or go to the nearest emergency room.';

      const detailAr =
        'لا يستطيع هذا النظام تقييم الحالات الطارئة أو تشخيصها. اطلب المساعدة الطبية العاجلة فوراً ولا تقد السيارة بنفسك.';
      const detailEn =
        'This educational system cannot assess urgency or diagnose emergency conditions. Seek immediate emergency medical help and do not drive yourself.';

      return {
        allowed: false,
        classification,
        earlyResponse: makePayload('emergency', egyptLineAr, egyptLineEn, detailAr, detailEn, [], [], true),
      };
    }

    case 'PERSONAL_DIAGNOSIS_REQUEST':
      return {
        allowed: false,
        classification,
        earlyResponse: makePayload(
          'diagnosis_request',
          'لا يمكنني تشخيص حالتك الصحية أو تفسير أعراضك أو نتائج تحاليلك الشخصية.',
          'I cannot diagnose your medical condition, assess personal symptoms, or interpret personal test results.',
          'أقدم معلومات طبية وتعليمية عامة فقط. يُرجى استشارة طبيب مختص لإجراء تقييم شخصي دقيق.',
          'I only provide general medical and health education. Please consult a licensed healthcare professional for personal evaluation.',
          [
            'ما الفرق بين المرض الحاد والمزمن كمفهوم طبي؟',
            'كيف يعمل الجهاز المناعي في جسم الإنسان؟',
          ],
          [
            'What is the difference between acute and chronic conditions?',
            'How does the human immune system work in general?',
          ],
          true
        ),
      };

    case 'TREATMENT_REQUEST':
      return {
        allowed: false,
        classification,
        earlyResponse: makePayload(
          'treatment_request',
          'لا يمكنني التوصية بعلاجات أو خطط علاجية أو إجراءات طبية أو وصفات منزلية لعلاج حالة.',
          'I cannot recommend treatments, medical procedures, home remedies as cures, or personalized care plans.',
          'اختيار الخطة العلاجية مسؤولية الطبيب المختص بناءً على التقييم الفردي. يمكنني فقط شرح المفاهيم الصحية والطبية العامة.',
          'Treatment decisions require evaluation by a qualified healthcare professional. I can only explain general medical and prevention concepts.',
          [
            'ما المقصود بمفهوم الوقاية من الأمراض في الصحة العامة؟',
            'ما هي عوامل الخطر العامة المرتبطة بالأمراض المزمنة؟',
          ],
          [
            'What does disease prevention mean in public health?',
            'What are general risk factors in public health education?',
          ],
          true
        ),
      };

    case 'MEDICATION_REQUEST':
      return {
        allowed: false,
        classification,
        earlyResponse: makePayload(
          'medication_request',
          'لا يمكنني وصف أو ترشيح الأدوية أو تحديد الجرعات أو تقديم نصيحة حول بدء أو إيقاف أو خلط الأدوية.',
          'I cannot recommend or prescribe medications, suggest dosages, or advise on starting, stopping, or combining drugs.',
          'وصف الدواء وتحديد الجرعة الآمنة اختصاص حصري للطبيب أو الصيدلي. يمكنني فقط شرح المفاهيم الطبية العامة.',
          'Medication selection and dosing belong to a licensed doctor or pharmacist. I can only explain general medical concepts.',
          [
            'ما هو الأنسولين وكيف يعمل في الجسم بشكل عام؟',
            'ما المقصود بمقاومة المضادات الحيوية؟',
          ],
          [
            'What is insulin and how does it work in the body?',
            'What does antibiotic resistance mean in general?',
          ],
          true
        ),
      };

    case 'OUT_OF_SCOPE': {
      const dynamicOutAr = buildDynamicOutOfScopeFallback(query, 'ar');
      const dynamicOutEn = buildDynamicOutOfScopeFallback(query, 'en');

      return {
        allowed: false,
        classification,
        earlyResponse: makePayload(
          'out_of_scope',
          dynamicOutAr,
          dynamicOutEn,
          '',
          '',
          [],
          [],
          false
        ),
      };
    }

    case 'AMBIGUOUS':
    default: {
      const snippet = (query || '').trim().slice(0, 60);
      return {
        allowed: false,
        classification,
        earlyResponse: makePayload(
          'clarification_required',
          snippet
            ? `لم يتضح لي الموضوع الطبي المقصود من "${snippet}". ما المرض أو المعلومة الصحية العامة التي تود أن أشرحها لك؟`
            : 'هل يمكنك توضيح الموضوع الطبي أو الصحي العام الذي تود معرفة معلومات تعليمية عنه؟',
          snippet
            ? `I'm not sure which health or medical topic you're referring to with "${snippet}". What general medical topic would you like to learn about?`
            : 'Could you please clarify which general medical or health education topic you would like to learn about?',
          '',
          '',
          [],
          [],
          false
        ),
      };
    }
  }
}

/**
 * Synchronous deterministic safety filter (used by offline unit tests & legacy sync callers).
 */
export function runPreRetrievalSafetyFilter(
  query: string,
  history: ChatTurnHistory[],
  uiLang: Language,
  startTimeMs: number
): SafetyFilterDecision {
  const classification = classifyDomainHeuristic(query, history, uiLang);
  return buildSafetyEarlyDecision(query, classification, uiLang, startTimeMs);
}

/**
 * Mandatory Universal Semantic Safety Filter executed prior to response generation for EVERY user prompt.
 */
export async function runSemanticSafetyFilter(
  query: string,
  history: ChatTurnHistory[],
  uiLang: Language,
  startTimeMs: number,
  options: SemanticClassifierOptions = {}
): Promise<SafetyFilterDecision> {
  const classification = await classifyDomainSemantic(query, history, uiLang, options);
  return buildSafetyEarlyDecision(query, classification, uiLang, startTimeMs);
}
