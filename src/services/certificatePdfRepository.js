import {
  certificateArtifactStore,
  CertificatePdfRepository,
} from './certificateArtifactStore'
import { buildCertificatePdf } from '../utils/certificateGenerator'

export const certificatePdfRepository = new CertificatePdfRepository({
  store: certificateArtifactStore,
  buildPdf: buildCertificatePdf,
})
